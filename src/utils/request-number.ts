// Generates SR-YYYYMMDD-### style request numbers and WO-YYYYMMDD-### order numbers.
function datePart(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function randPart(): string {
  return Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
}

export function generateRequestNumber(): string {
  return `SR-${datePart()}-${randPart()}`;
}

export function generateOrderNumber(): string {
  return `WO-${datePart()}-${randPart()}`;
}
