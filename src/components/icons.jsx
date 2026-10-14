// Small line icons (24x24, drawn in the current text color). Home's boxes, category rows and chips use them.
import { getCategory } from '../lib/categories.js';

const P = {
  // category icons
  'eating-out': <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v7M17 21V3c-2 1.5-3 4-3 7 0 1.5 1 2.5 3 2.5" />,
  groceries: <><circle cx="9" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" /><path d="M3 4h2.5l2 11h10.5l2-8H6.5" /></>,
  shopping: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  entertainment: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4.5-2.5z" /></>,
  'personal-care': <><path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" /><path d="M19 15v4M17 17h4" /></>,
  health: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  sport: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  education: <path d="M12 6c-2-1.5-5-2-8-2v13c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v13" />,
  tuition: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" /></>,
  housing: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></>,
  utilities: <path d="M13 2L5 13.5h6L10 22l8-11.5h-6z" />,
  subscriptions: <path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4" />,
  transport: <><rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 11h16M8 18v3M16 18v3M8 15h.01M16 15h.01" /></>,
  travel: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  gifts: <><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M12 8C10 8 8 7 8 5.5S9.5 3 11 4.5 12 8 12 8zm0 0c2 0 4-1 4-2.5S14.5 3 13 4.5 12 8 12 8z" /></>,
  fees: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9.5 9.5h.01M14.5 14.5h.01" /></>,
  professional: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>,
  other: <><circle cx="12" cy="12" r="9" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  insurance: <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" />,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><path d="M7.5 7.5h.01" /></>,
  // box + chip icons
  'arrow-in': <path d="M17 7L7 17M16 17H7V8" />,
  'arrow-out': <path d="M7 17L17 7M8 7h9v9" />,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  piggy: <><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z" /><path d="M2 9v1c0 1.1.9 2 2 2h1M16 11h.01" /></>,
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  inbox: <path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>,
  alarm: <><circle cx="12" cy="13" r="7" /><path d="M12 10v3l2 2M4 5l3-2M20 5l-3-2" /></>,
  'chev-down': <path d="M6 9l6 6 6-6" />,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.4.9 2.2 1.8 2.6C10.5 8.7 10.6 5.5 12 3z" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
};

// Which icon each category uses (ids never change; custom categories get the tag icon)
const CATEGORY_ICON = {
  'job-income': 'professional', family: 'heart', interest: 'fees', income: 'arrow-in',
  investing: 'trend', saving: 'piggy', internal: 'subscriptions',
  business: 'professional', childcare: 'heart', 'home-loan': 'housing', pets: 'heart', tax: 'fees', super: 'piggy',
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {P[name] ?? P.tag}
    </svg>
  );
}

function categoryIconName(id) {
  if (P[id]) return id;
  if (CATEGORY_ICON[id]) return CATEGORY_ICON[id];
  return getCategory(id)?.custom ? 'tag' : 'other';
}

export const CategoryIcon = ({ id, size = 20 }) => <Icon name={categoryIconName(id)} size={size} />;
