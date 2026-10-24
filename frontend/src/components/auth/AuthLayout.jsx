export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 sm:px-6 flex items-center justify-center">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true"><div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-indigo-200/55 blur-3xl"></div><div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-violet-200/50 blur-3xl"></div><div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(99,102,241,0.08)_1px,transparent_0)] bg-[size:24px_24px]"></div></div>
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-white text-sm font-bold tracking-tight text-indigo-700 shadow-sm">MM</div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">MindMark</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/70 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}