'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Loader2,
  Mail,
  Lock,
  User,
  Phone,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

const HeroScene = dynamic(() => import('@/components/three/HeroScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gradient-to-br from-[#0a0e1a] via-[#111827] to-[#0a0e1a]" />
  ),
});

/* ---------- Animation variants ---------- */

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
};

/* ---------- Password strength ---------- */

type PasswordStrength = 'weak' | 'fair' | 'strong';

function getPasswordStrength(pw: string): { level: PasswordStrength; score: number } {
  if (!pw) return { level: 'weak', score: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 2) return { level: 'weak', score };
  if (score <= 3) return { level: 'fair', score };
  return { level: 'strong', score };
}

const strengthConfig: Record<PasswordStrength, { label: string; color: string; barColor: string }> = {
  weak: { label: 'Weak', color: 'text-red-400', barColor: 'bg-red-500' },
  fair: { label: 'Fair', color: 'text-amber-400', barColor: 'bg-amber-500' },
  strong: { label: 'Strong', color: 'text-emerald-400', barColor: 'bg-emerald-500' },
};

/* ---------- Field errors ---------- */

interface FieldErrors {
  full_name?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

function validateFields(values: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.full_name.trim()) {
    errors.full_name = 'Full name is required';
  }

  if (!values.email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address';
  }

  if (values.phone && !/^[+]?[\d\s()-]{7,20}$/.test(values.phone)) {
    errors.phone = 'Enter a valid phone number';
  }

  if (!values.password) {
    errors.password = 'Password is required';
  } else if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password';
  } else if (values.password && values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

/* ---------- Floating input component ---------- */

function FloatingInput({
  icon: Icon,
  label,
  type = 'text',
  value,
  onChange,
  error,
  required = false,
  hint,
  rightElement,
  autoComplete,
  id,
}: {
  icon: React.ElementType;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  hint?: string;
  rightElement?: React.ReactNode;
  autoComplete?: string;
  id: string;
}) {
  return (
    <div>
      <div className="relative group">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-blue-400 transition-colors" />
        <input
          id={id}
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder=" "
          autoComplete={autoComplete}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`peer w-full pl-11 ${rightElement ? 'pr-11' : 'pr-4'} pt-5 pb-2 rounded-xl bg-white/[0.04] border text-[var(--text-primary)] text-sm placeholder-transparent focus:outline-none focus:bg-white/[0.06] transition-all ${
            error
              ? 'border-red-500/50 focus:border-red-500/70'
              : 'border-white/[0.08] focus:border-blue-500/50'
          }`}
        />
        <label
          htmlFor={id}
          className="absolute left-11 text-[var(--text-muted)] text-xs top-1.5 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-blue-400 pointer-events-none"
        >
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 ml-1 text-xs text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${id}-hint`} className="mt-1 ml-1 text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---------- Registration page ---------- */

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [apiError, setApiError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    const errors = validateFields({ full_name: fullName, email, phone, password, confirmPassword });
    setFieldErrors(errors);

    // Mark all fields as touched on submit
    setTouched(new Set(['full_name', 'email', 'phone', 'password', 'confirmPassword']));

    if (Object.keys(errors).length > 0) return;

    setIsLoading(true);
    try {
      await api.post('/api/auth/signup', {
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });

      setSuccess(true);
      toast.success('Account created successfully! Redirecting to login...');

      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Live validation on blur
  const handleBlur = useCallback(
    (field: string) => {
      markTouched(field);
      const errors = validateFields({ full_name: fullName, email, phone, password, confirmPassword });
      setFieldErrors((prev) => ({
        ...prev,
        [field]: errors[field as keyof FieldErrors],
      }));
    },
    [fullName, email, phone, password, confirmPassword, markTouched],
  );

  const visibleError = (field: keyof FieldErrors) =>
    touched.has(field) ? fieldErrors[field] : undefined;

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      {/* Left: 3D Scene (hidden on mobile, shown as background) */}
      <div className="hidden lg:block lg:w-1/2 xl:w-3/5 relative">
        <HeroScene />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a0e1a]/80 pointer-events-none" />
      </div>

      {/* Mobile background */}
      <div className="lg:hidden absolute inset-0 z-0">
        <HeroScene />
        <div className="absolute inset-0 bg-[#0a0e1a]/85 backdrop-blur-sm" />
      </div>

      {/* Right: Registration Form */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-8 lg:px-12 xl:px-20 overflow-y-auto">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-md space-y-6"
        >
          {/* Brand */}
          <motion.div variants={item} className="text-center lg:text-left">
            <h1 className="text-4xl font-bold gradient-text mb-2">ServiNexa</h1>
            <p className="text-[var(--text-secondary)] text-sm">
              Industrial Equipment Activity Management
            </p>
          </motion.div>

          {/* Heading */}
          <motion.div variants={item}>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              Create your account
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Get started with ServiNexa in a few steps
            </p>
          </motion.div>

          {/* Success message */}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-300">Account created successfully!</p>
                <p className="text-xs text-emerald-400/70 mt-0.5">Redirecting to login...</p>
              </div>
            </motion.div>
          )}

          {/* API Error */}
          {apiError && !success && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{apiError}</p>
            </motion.div>
          )}

          {/* Form */}
          <motion.form
            variants={item}
            onSubmit={handleSubmit}
            noValidate
            className="space-y-4"
          >
            {/* Section: Personal Information */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Personal Information
              </p>

              <FloatingInput
                id="full_name"
                icon={User}
                label="Full Name"
                value={fullName}
                onChange={(v) => {
                  setFullName(v);
                  if (touched.has('full_name')) {
                    const errors = validateFields({ full_name: v, email, phone, password, confirmPassword });
                    setFieldErrors((prev) => ({ ...prev, full_name: errors.full_name }));
                  }
                }}
                error={visibleError('full_name')}
                required
                autoComplete="name"
              />

              <FloatingInput
                id="email"
                icon={Mail}
                label="Email Address"
                type="email"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  if (touched.has('email')) {
                    const errors = validateFields({ full_name: fullName, email: v, phone, password, confirmPassword });
                    setFieldErrors((prev) => ({ ...prev, email: errors.email }));
                  }
                }}
                error={visibleError('email')}
                required
                autoComplete="email"
              />

              <FloatingInput
                id="phone"
                icon={Phone}
                label="Phone Number"
                type="tel"
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  if (touched.has('phone')) {
                    const errors = validateFields({ full_name: fullName, email, phone: v, password, confirmPassword });
                    setFieldErrors((prev) => ({ ...prev, phone: errors.phone }));
                  }
                }}
                error={visibleError('phone')}
                hint="Optional - e.g. +1 (555) 123-4567"
                autoComplete="tel"
              />
            </div>

            {/* Section: Security */}
            <div className="space-y-4 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Security
              </p>

              <div>
                <FloatingInput
                  id="password"
                  icon={Lock}
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    if (touched.has('password')) {
                      const errors = validateFields({ full_name: fullName, email, phone, password: v, confirmPassword });
                      setFieldErrors((prev) => ({ ...prev, password: errors.password }));
                    }
                    // Re-validate confirm if it was touched
                    if (touched.has('confirmPassword') && confirmPassword) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        confirmPassword: v !== confirmPassword ? 'Passwords do not match' : undefined,
                      }));
                    }
                  }}
                  error={visibleError('password')}
                  required
                  autoComplete="new-password"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                {/* Password strength indicator */}
                {password.length > 0 && (
                  <div className="mt-2 ml-1 space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            strength.score >= i + 1
                              ? strengthConfig[strength.level].barColor
                              : 'bg-white/[0.08]'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs ${strengthConfig[strength.level].color}`}>
                      {strengthConfig[strength.level].label} password
                    </p>
                  </div>
                )}
              </div>

              <FloatingInput
                id="confirmPassword"
                icon={Lock}
                label="Confirm Password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(v) => {
                  setConfirmPassword(v);
                  if (touched.has('confirmPassword')) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      confirmPassword:
                        !v ? 'Please confirm your password' : v !== password ? 'Passwords do not match' : undefined,
                    }));
                  }
                }}
                error={visibleError('confirmPassword')}
                required
                autoComplete="new-password"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirm((p) => !p)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || success}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:from-blue-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Account created
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </motion.form>

          {/* Sign in link */}
          <motion.div variants={item} className="text-center">
            <p className="text-sm text-[var(--text-muted)]">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
