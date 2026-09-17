export interface IANATimezoneItem {
    id: string;
    name: string;
    offset: string;
    label: string;
}

export interface CurrencyItem {
    code: string;
    name: string;
    symbol: string;
    decimals: number;
}

export interface CountryItem {
    code: string;
    name: string;
    dialCode: string;
    defaultCurrency: string;
    defaultTimezone: string;
}

export const IANA_TIMEZONES: IANATimezoneItem[] = [
    { id: "UTC", name: "UTC", offset: "GMT+0", label: "UTC Standard Clock (GMT+0)" },
    { id: "America/New_York", name: "New York", offset: "GMT-4", label: "America/New_York (Eastern Time, GMT-4/5)" },
    { id: "America/Chicago", name: "Chicago", offset: "GMT-5", label: "America/Chicago (Central Time, GMT-5/6)" },
    { id: "America/Denver", name: "Denver", offset: "GMT-6", label: "America/Denver (Mountain Time, GMT-6/7)" },
    { id: "America/Los_Angeles", name: "Los Angeles", offset: "GMT-7", label: "America/Los_Angeles (Pacific Time, GMT-7/8)" },
    { id: "America/Toronto", name: "Toronto", offset: "GMT-4", label: "America/Toronto (Canada Eastern, GMT-4/5)" },
    { id: "America/Vancouver", name: "Vancouver", offset: "GMT-7", label: "America/Vancouver (Canada Pacific, GMT-7/8)" },
    { id: "America/Sao_Paulo", name: "São Paulo", offset: "GMT-3", label: "America/Sao_Paulo (Brazil, GMT-3)" },
    { id: "America/Mexico_City", name: "Mexico City", offset: "GMT-6", label: "America/Mexico_City (Central Standard, GMT-6)" },
    { id: "Europe/London", name: "London", offset: "GMT+1", label: "Europe/London (GMT / British Summer Time, GMT+0/1)" },
    { id: "Europe/Paris", name: "Paris", offset: "GMT+2", label: "Europe/Paris (Central European Time, GMT+1/2)" },
    { id: "Europe/Berlin", name: "Berlin", offset: "GMT+2", label: "Europe/Berlin (Central European Time, GMT+1/2)" },
    { id: "Europe/Rome", name: "Rome", offset: "GMT+2", label: "Europe/Rome (Central European Time, GMT+1/2)" },
    { id: "Europe/Madrid", name: "Madrid", offset: "GMT+2", label: "Europe/Madrid (Central European Time, GMT+1/2)" },
    { id: "Europe/Amsterdam", name: "Amsterdam", offset: "GMT+2", label: "Europe/Amsterdam (Central European Time, GMT+1/2)" },
    { id: "Europe/Zurich", name: "Zurich", offset: "GMT+2", label: "Europe/Zurich (Swiss Time, GMT+1/2)" },
    { id: "Europe/Dublin", name: "Dublin", offset: "GMT+1", label: "Europe/Dublin (Irish Standard Time, GMT+0/1)" },
    { id: "Europe/Stockholm", name: "Stockholm", offset: "GMT+2", label: "Europe/Stockholm (Sweden, GMT+1/2)" },
    { id: "Europe/Athens", name: "Athens", offset: "GMT+3", label: "Europe/Athens (Eastern European Time, GMT+2/3)" },
    { id: "Europe/Istanbul", name: "Istanbul", offset: "GMT+3", label: "Europe/Istanbul (Turkey Time, GMT+3)" },
    { id: "Asia/Karachi", name: "Karachi", offset: "GMT+5", label: "Asia/Karachi (Pakistan Standard Time, GMT+5)" },
    { id: "Asia/Dubai", name: "Dubai", offset: "GMT+4", label: "Asia/Dubai (Gulf Standard Time, GMT+4)" },
    { id: "Asia/Riyadh", name: "Riyadh", offset: "GMT+3", label: "Asia/Riyadh (Arabia Standard Time, GMT+3)" },
    { id: "Asia/Kolkata", name: "Kolkata / Mumbai", offset: "GMT+5:30", label: "Asia/Kolkata (India Standard Time, GMT+5:30)" },
    { id: "Asia/Singapore", name: "Singapore", offset: "GMT+8", label: "Asia/Singapore (Singapore Standard Time, GMT+8)" },
    { id: "Asia/Hong_Kong", name: "Hong Kong", offset: "GMT+8", label: "Asia/Hong_Kong (Hong Kong Time, GMT+8)" },
    { id: "Asia/Tokyo", name: "Tokyo", offset: "GMT+9", label: "Asia/Tokyo (Japan Standard Time, GMT+9)" },
    { id: "Asia/Seoul", name: "Seoul", offset: "GMT+9", label: "Asia/Seoul (Korea Standard Time, GMT+9)" },
    { id: "Asia/Bangkok", name: "Bangkok", offset: "GMT+7", label: "Asia/Bangkok (Indochina Time, GMT+7)" },
    { id: "Asia/Jakarta", name: "Jakarta", offset: "GMT+7", label: "Asia/Jakarta (Western Indonesia Time, GMT+7)" },
    { id: "Asia/Kuala_Lumpur", name: "Kuala Lumpur", offset: "GMT+8", label: "Asia/Kuala_Lumpur (Malaysia Time, GMT+8)" },
    { id: "Asia/Manila", name: "Manila", offset: "GMT+8", label: "Asia/Manila (Philippine Standard Time, GMT+8)" },
    { id: "Asia/Dhaka", name: "Dhaka", offset: "GMT+6", label: "Asia/Dhaka (Bangladesh Standard Time, GMT+6)" },
    { id: "Asia/Qatar", name: "Doha", offset: "GMT+3", label: "Asia/Qatar (Arabia Standard Time, GMT+3)" },
    { id: "Australia/Sydney", name: "Sydney", offset: "GMT+10", label: "Australia/Sydney (Australian Eastern Time, GMT+10/11)" },
    { id: "Australia/Melbourne", name: "Melbourne", offset: "GMT+10", label: "Australia/Melbourne (Australian Eastern Time, GMT+10/11)" },
    { id: "Australia/Brisbane", name: "Brisbane", offset: "GMT+10", label: "Australia/Brisbane (Queensland, GMT+10)" },
    { id: "Australia/Perth", name: "Perth", offset: "GMT+8", label: "Australia/Perth (Australian Western Time, GMT+8)" },
    { id: "Pacific/Auckland", name: "Auckland", offset: "GMT+12", label: "Pacific/Auckland (New Zealand Time, GMT+12/13)" },
    { id: "Africa/Cairo", name: "Cairo", offset: "GMT+3", label: "Africa/Cairo (Eastern European Time, GMT+2/3)" },
    { id: "Africa/Johannesburg", name: "Johannesburg", offset: "GMT+2", label: "Africa/Johannesburg (South Africa Time, GMT+2)" },
    { id: "Africa/Lagos", name: "Lagos", offset: "GMT+1", label: "Africa/Lagos (West Africa Time, GMT+1)" },
    { id: "Africa/Nairobi", name: "Nairobi", offset: "GMT+3", label: "Africa/Nairobi (East Africa Time, GMT+3)" },
];

export const CURRENCIES: CurrencyItem[] = [
    { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
    { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
    { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
    { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2 },
    { code: "AUD", name: "Australian Dollar", symbol: "AU$", decimals: 2 },
    { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 0 },
    { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2 },
    { code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2 },
    { code: "QAR", name: "Qatari Riyal", symbol: "QAR", decimals: 2 },
    { code: "SGD", name: "Singapore Dollar", symbol: "SG$", decimals: 2 },
    { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2 },
    { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
    { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
    { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
    { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
    { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
    { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
    { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
    { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
    { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
    { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
    { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2 },
    { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 0 },
    { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
    { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
    { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
];

export const COUNTRIES: CountryItem[] = [
    { code: "US", name: "United States", dialCode: "+1", defaultCurrency: "USD", defaultTimezone: "America/New_York" },
    { code: "GB", name: "United Kingdom", dialCode: "+44", defaultCurrency: "GBP", defaultTimezone: "Europe/London" },
    { code: "CA", name: "Canada", dialCode: "+1", defaultCurrency: "CAD", defaultTimezone: "America/Toronto" },
    { code: "AU", name: "Australia", dialCode: "+61", defaultCurrency: "AUD", defaultTimezone: "Australia/Sydney" },
    { code: "PK", name: "Pakistan", dialCode: "+92", defaultCurrency: "PKR", defaultTimezone: "Asia/Karachi" },
    { code: "AE", name: "United Arab Emirates", dialCode: "+971", defaultCurrency: "AED", defaultTimezone: "Asia/Dubai" },
    { code: "SA", name: "Saudi Arabia", dialCode: "+966", defaultCurrency: "SAR", defaultTimezone: "Asia/Riyadh" },
    { code: "QA", name: "Qatar", dialCode: "+974", defaultCurrency: "QAR", defaultTimezone: "Asia/Qatar" },
    { code: "DE", name: "Germany", dialCode: "+49", defaultCurrency: "EUR", defaultTimezone: "Europe/Berlin" },
    { code: "FR", name: "France", dialCode: "+33", defaultCurrency: "EUR", defaultTimezone: "Europe/Paris" },
    { code: "IT", name: "Italy", dialCode: "+39", defaultCurrency: "EUR", defaultTimezone: "Europe/Rome" },
    { code: "ES", name: "Spain", dialCode: "+34", defaultCurrency: "EUR", defaultTimezone: "Europe/Madrid" },
    { code: "NL", name: "Netherlands", dialCode: "+31", defaultCurrency: "EUR", defaultTimezone: "Europe/Amsterdam" },
    { code: "CH", name: "Switzerland", dialCode: "+41", defaultCurrency: "CHF", defaultTimezone: "Europe/Zurich" },
    { code: "IE", name: "Ireland", dialCode: "+353", defaultCurrency: "EUR", defaultTimezone: "Europe/Dublin" },
    { code: "SE", name: "Sweden", dialCode: "+46", defaultCurrency: "SEK", defaultTimezone: "Europe/Stockholm" },
    { code: "NO", name: "Norway", dialCode: "+47", defaultCurrency: "NOK", defaultTimezone: "Europe/Oslo" },
    { code: "SG", name: "Singapore", dialCode: "+65", defaultCurrency: "SGD", defaultTimezone: "Asia/Singapore" },
    { code: "HK", name: "Hong Kong", dialCode: "+852", defaultCurrency: "HKD", defaultTimezone: "Asia/Hong_Kong" },
    { code: "JP", name: "Japan", dialCode: "+81", defaultCurrency: "JPY", defaultTimezone: "Asia/Tokyo" },
    { code: "IN", name: "India", dialCode: "+91", defaultCurrency: "INR", defaultTimezone: "Asia/Kolkata" },
    { code: "NZ", name: "New Zealand", dialCode: "+64", defaultCurrency: "NZD", defaultTimezone: "Pacific/Auckland" },
    { code: "MY", name: "Malaysia", dialCode: "+60", defaultCurrency: "MYR", defaultTimezone: "Asia/Kuala_Lumpur" },
    { code: "PH", name: "Philippines", dialCode: "+63", defaultCurrency: "PHP", defaultTimezone: "Asia/Manila" },
    { code: "TH", name: "Thailand", dialCode: "+66", defaultCurrency: "THB", defaultTimezone: "Asia/Bangkok" },
    { code: "ID", name: "Indonesia", dialCode: "+62", defaultCurrency: "IDR", defaultTimezone: "Asia/Jakarta" },
    { code: "ZA", name: "South Africa", dialCode: "+27", defaultCurrency: "ZAR", defaultTimezone: "Africa/Johannesburg" },
    { code: "BR", name: "Brazil", dialCode: "+55", defaultCurrency: "BRL", defaultTimezone: "America/Sao_Paulo" },
    { code: "MX", name: "Mexico", dialCode: "+52", defaultCurrency: "MXN", defaultTimezone: "America/Mexico_City" },
    { code: "TR", name: "Turkey", dialCode: "+90", defaultCurrency: "TRY", defaultTimezone: "Europe/Istanbul" },
    { code: "EG", name: "Egypt", dialCode: "+20", defaultCurrency: "EGP", defaultTimezone: "Africa/Cairo" },
];
