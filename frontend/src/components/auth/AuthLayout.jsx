export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 via-white to-purple-50
                    flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-indigo-600 text-white text-2xl mb-4 shadow-lg">
            🧠
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}