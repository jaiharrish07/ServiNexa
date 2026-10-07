'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Loader2, Mail, Lock, Zap, User, Phone } from 'lucide-react';
import { useAuth } from '@/store/auth';

const HeroScene = dynamic(() => import('@/components/three/HeroScene'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gradient-to-br from-[#0a0e1a] via-[#111827] to-[#0a0e1a]" />
  ),
});

const demoAccounts = [
  { label: 'Admin', email: 'admin@dqbh.com', password: 'Admin123!' },
  { label: 'Ops Manager', email: 'ops@dqbh.com', password: 'Ops123!' },
  { label: 'Technician', email: 'alex.chen@dqbh.com', password: 'Tech123!' },
  { label: 'Customer', email: 'customer@dqbh.com', password: 'Cust123!' },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
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

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const signup = useAuth((s) => s.signup);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (isRegister) {
        if (!fullName.trim()) { setError('Full name is required'); setIsLoading(false); return; }
        await signup(email, password, fullName, phone || undefined);
      } else {
        await login(email, password);
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : isRegister ? 'Registration failed.' : 'Login failed.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
    setIsLoading(true);
    try {
      await login(demoEmail, demoPassword);
      router.push('/dashboard');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister((v) => !v);
    setError('');
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      <div className="hidden lg:block lg:w-1/2 xl:w-3/5 relative">
        <HeroScene />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a0e1a]/80 pointer-events-none" />
      </div>

      <div className="lg:hidden absolute inset-0 z-0">
        <HeroScene />
        <div className="absolute inset-0 bg-[#0a0e1a]/85 backdrop-blur-sm" />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-12 lg:px-12 xl:px-20">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-md space-y-8"
        >
          <motion.div variants={item} className="text-center lg:text-left">
            <h1 className="text-4xl font-bold gradient-text mb-2">ServiNexa</h1>
            <p className="text-[var(--text-secondary)] text-sm">
              Industrial Equipment Activity Management
            </p>
          </motion.div>

          <motion.div variants={item}>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              {isRegister ? 'Create account' : 'Welcome back'}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {isRegister ? 'Register a new account to get started' : 'Sign in to your account to continue'}
            </p>
          </motion.div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </motion.div>
          )}

          <motion.form variants={item} onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {isRegister && (
                <motion.div
                  key="register-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-blue-400 transition-colors" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder=" "
                      className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[var(--text-primary)] text-sm placeholder-transparent focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                    />
                    <label className="absolute left-11 text-[var(--text-muted)] text-xs top-1.5 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-blue-400 pointer-events-none">
                      Full name
                    </label>
                  </div>
                  <div className="relative group">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-blue-400 transition-colors" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder=" "
                      className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[var(--text-primary)] text-sm placeholder-transparent focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
                    />
                    <label className="absolute left-11 text-[var(--text-muted)] text-xs top-1.5 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-blue-400 pointer-events-none">
                      Phone (optional)
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-blue-400 transition-colors" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[var(--text-primary)] text-sm placeholder-transparent focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
              />
              <label className="absolute left-11 text-[var(--text-muted)] text-xs top-1.5 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-blue-400 pointer-events-none">
                Email address
              </label>
            </div>

            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-blue-400 transition-colors" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                minLength={isRegister ? 8 : undefined}
                className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[var(--text-primary)] text-sm placeholder-transparent focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.06] transition-all"
              />
              <label className="absolute left-11 text-[var(--text-muted)] text-xs top-1.5 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-blue-400 pointer-events-none">
                Password{isRegister ? ' (min 8 chars)' : ''}
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:from-blue-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isRegister ? 'Creating account...' : 'Signing in...'}
                </>
              ) : isRegister ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
            </div>
          </motion.form>

          {!isRegister && (
            <motion.div variants={item} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                  <Zap className="w-3 h-3" />
                  Quick Demo Login
                </span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => handleDemoLogin(account.email, account.password)}
                    disabled={isLoading}
                    className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.06] hover:border-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-center"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
