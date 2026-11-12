// Transfermarkt country names -> flag-icons codes (ISO 3166-1 alpha-2, plus the UK home nations).
const CODES = {
  Albania: 'al', Algeria: 'dz', Angola: 'ao', Argentina: 'ar', Armenia: 'am', Australia: 'au', Austria: 'at', Azerbaijan: 'az',
  Belarus: 'by', Belgium: 'be', Benin: 'bj', 'Bosnia-Herzegovina': 'ba', Brazil: 'br', Bulgaria: 'bg', 'Burkina Faso': 'bf', Burundi: 'bi',
  Cameroon: 'cm', Canada: 'ca', 'Cape Verde': 'cv', Chile: 'cl', China: 'cn', Colombia: 'co', Comoros: 'km', Congo: 'cg', 'Costa Rica': 'cr',
  "Cote d'Ivoire": 'ci', Croatia: 'hr', Curacao: 'cw', Cyprus: 'cy', 'Czech Republic': 'cz', Czechia: 'cz', Denmark: 'dk', 'DR Congo': 'cd',
  Ecuador: 'ec', Egypt: 'eg', England: 'gb-eng', 'Equatorial Guinea': 'gq', Estonia: 'ee', Finland: 'fi', France: 'fr', Gabon: 'ga',
  Georgia: 'ge', Germany: 'de', Ghana: 'gh', Greece: 'gr', Guinea: 'gn', 'Guinea-Bissau': 'gw', Haiti: 'ht', Honduras: 'hn', Hungary: 'hu',
  Iceland: 'is', Iran: 'ir', Iraq: 'iq', Ireland: 'ie', Israel: 'il', Italy: 'it', Jamaica: 'jm', Japan: 'jp', Kazakhstan: 'kz', Kenya: 'ke',
  Kosovo: 'xk', Kyrgyzstan: 'kg', Latvia: 'lv', Lithuania: 'lt', Luxembourg: 'lu', Mali: 'ml', Malta: 'mt', Mexico: 'mx', Moldova: 'md',
  Montenegro: 'me', Morocco: 'ma', Mozambique: 'mz', Netherlands: 'nl', 'New Zealand': 'nz', Nigeria: 'ng', 'North Macedonia': 'mk',
  'Northern Ireland': 'gb-nir', Norway: 'no', Panama: 'pa', Paraguay: 'py', Peru: 'pe', Poland: 'pl', Portugal: 'pt', Romania: 'ro',
  Russia: 'ru', Rwanda: 'rw', 'Saudi Arabia': 'sa', Scotland: 'gb-sct', Senegal: 'sn', Serbia: 'rs', 'Sierra Leone': 'sl', Slovakia: 'sk',
  Slovenia: 'si', 'South Africa': 'za', 'South Korea': 'kr', 'Korea, South': 'kr', Spain: 'es', Suriname: 'sr', Sweden: 'se',
  Switzerland: 'ch', 'The Gambia': 'gm', Gambia: 'gm', Togo: 'tg', Tunisia: 'tn', Türkiye: 'tr', Turkey: 'tr', Ukraine: 'ua',
  'United States': 'us', Uruguay: 'uy', Uzbekistan: 'uz', Venezuela: 've', Wales: 'gb-wls', Zambia: 'zm', Zimbabwe: 'zw',
};
export const flagCode = (country) => (country ? CODES[country] || null : null);
