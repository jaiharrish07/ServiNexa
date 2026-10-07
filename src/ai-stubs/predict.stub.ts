interface MachineData {
  air_temp: number;
  process_temp: number;
  rotational_speed: number;
  torque: number;
  tool_wear: number;
}

interface FailureMode {
  mode: string;
  probability: number;
}

interface PredictResult {
  failure_probability: number;
  risk_score: number; // alias of failure_probability (new-spec key)
  risk_level: string;
  predicted_failure_mode: string;
  confidence: number;
  failure_modes: FailureMode[];
  recommended_action: string;
  reasoning: string;
}

/**
 * Coerce a possibly-missing / NaN numeric field to a sane default. Keeps the
 * heuristic deterministic even when upstream sensor data is incomplete.
 */
function coerce(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Rule-based predictive-maintenance fallback. Mirrors the shape of the live
 * AI health-prediction response using a simple additive risk heuristic.
 */
export function predictStub(machineData: MachineData): PredictResult {
  const air_temp = coerce(machineData?.air_temp, 25);
  const process_temp = coerce(machineData?.process_temp, 35);
  const rotational_speed = coerce(machineData?.rotational_speed, 1500);
  const torque = coerce(machineData?.torque, 40);
  const tool_wear = coerce(machineData?.tool_wear, 100);

  let score = 0;
  const modes: FailureMode[] = [];

  const tempDiff = process_temp - air_temp;
  if (tempDiff > 10) {
    score += 0.2;
    modes.push({ mode: 'Heat Dissipation Failure', probability: 0.3 });
  }

  if (tool_wear > 200) {
    score += 0.3;
    modes.push({ mode: 'Tool Wear Failure', probability: 0.5 });
  }

  if (torque > 60) {
    score += 0.15;
    modes.push({ mode: 'Overstrain Failure', probability: 0.2 });
  }

  if (rotational_speed < 1200 || rotational_speed > 2400) {
    score += 0.1;
    modes.push({ mode: 'Power Failure', probability: 0.15 });
  }

  const risk_level =
    score >= 0.7
      ? 'CRITICAL'
      : score >= 0.4
      ? 'HIGH'
      : score >= 0.15
      ? 'MEDIUM'
      : 'LOW';

  const failure_probability = Number(Math.min(score, 1).toFixed(3));

  const failure_modes: FailureMode[] =
    modes.length > 0
      ? modes
      : [{ mode: 'No significant risk detected', probability: 0.05 }];

  const recommended_action =
    risk_level === 'CRITICAL' || risk_level === 'HIGH'
      ? 'Schedule immediate maintenance inspection'
      : 'Continue monitoring, next scheduled maintenance adequate';

  // Most likely failure mode drives the new-spec `predicted_failure_mode`.
  const top = failure_modes.reduce((a, b) => (b.probability > a.probability ? b : a));
  const predicted_failure_mode = top.mode === 'No significant risk detected' ? 'None' : top.mode;
  const confidence = modes.length > 0 ? 0.6 : 0.8;
  const reasoning =
    modes.length > 0
      ? `Rule-based: ${modes.map((m) => m.mode).join(', ')} indicated by abnormal readings.`
      : 'Rule-based: all readings within normal operating ranges.';

  return {
    failure_probability,
    risk_score: failure_probability,
    risk_level,
    predicted_failure_mode,
    confidence,
    failure_modes,
    recommended_action,
    reasoning,
  };
}
