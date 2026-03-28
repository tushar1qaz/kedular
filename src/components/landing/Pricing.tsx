import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For solo schedulers trying it out.',
    features: [
      '1 project',
      '5 AI chat messages / month',
      'XER & CSV import',
      'Gantt chart',
      'CSV export',
    ],
    cta: 'Start free',
    href: '/signup',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: 'per month',
    description: 'For schedulers who need the full toolset.',
    features: [
      'Unlimited projects',
      'Unlimited AI chat',
      'XER round-trip export',
      'What-if scenarios',
      'Version comparison',
      'Look-ahead PDF export',
      'Schedule health scoring',
      'Priority support',
    ],
    cta: 'Start Pro trial',
    href: '/signup?plan=pro',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For PMO teams and large programmes.',
    features: [
      'Everything in Pro',
      'Team collaboration',
      'SSO / SAML',
      'Audit log',
      'Custom data retention',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Contact sales',
    href: 'mailto:sales@kedular.com',
    featured: false,
  },
];

export default function Pricing() {
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Start free. Upgrade when you need the power tools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-8 ${
                plan.featured
                  ? 'bg-slate-900 border-2 border-amber-500 shadow-2xl shadow-amber-500/10 scale-105'
                  : 'bg-white border border-slate-200'
              }`}
            >
              {plan.featured && (
                <div className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">
                  Most popular
                </div>
              )}
              <h3 className={`text-xl font-bold mb-1 ${plan.featured ? 'text-white' : 'text-slate-900'}`}>
                {plan.name}
              </h3>
              <div className="mb-1">
                <span className={`text-4xl font-bold ${plan.featured ? 'text-white' : 'text-slate-900'}`}>
                  {plan.price}
                </span>
                <span className={`text-sm ml-1 ${plan.featured ? 'text-slate-400' : 'text-slate-500'}`}>
                  / {plan.period}
                </span>
              </div>
              <p className={`text-sm mb-6 ${plan.featured ? 'text-slate-400' : 'text-slate-500'}`}>
                {plan.description}
              </p>

              <Link
                href={plan.href}
                className={`block w-full text-center py-3 px-4 rounded-lg font-semibold transition-all mb-8 ${
                  plan.featured
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
                    : 'border border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      className={`w-4 h-4 mt-0.5 shrink-0 ${plan.featured ? 'text-amber-400' : 'text-green-500'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className={`text-sm ${plan.featured ? 'text-slate-300' : 'text-slate-600'}`}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
