/**
 * USSD screens in English, Twi and Ewe. A screen holds about 160 characters on most handsets, so keep them
 * short. Twi and Ewe follow the PWA's translations and need the same native-speaker review.
 */
export type UssdLang = 'en' | 'tw' | 'ee'

export const CROP_NAMES: Record<UssdLang, Record<string, string>> = {
  en: { maize: 'Maize', tomato: 'Tomato', cassava: 'Cassava', pepper: 'Pepper', okro: 'Okro', yam: 'Yam', cocoa: 'Cocoa', plantain: 'Plantain' },
  tw: { maize: 'Aburoo', tomato: 'Ntoosi', cassava: 'Bankye', pepper: 'Mako', okro: 'Nkruma', yam: 'Bayerɛ', cocoa: 'Kookoo', plantain: 'Brɔdeɛ' },
  ee: { maize: 'Bli', tomato: 'Tomato', cassava: 'Agbeli', pepper: 'Atadi', okro: 'Fetri', yam: 'Te', cocoa: 'Kakao', plantain: 'Abladzo' },
}

export const USSD_TEXT = {
  en: {
    main: 'AgroConnect\n1 Market prices\n2 Farming advice\n3 My registration\n4 Ask for an agent visit\n5 Today\'s weather\n0 Exit',
    pickCrop: 'Price of which crop?',
    noPrice: 'No price recorded for {crop} yet.',
    price: '{crop}: {currency} {price} per kg ({change}). Updated {date}.',
    up: 'up {n}% this week',
    down: 'down {n}% this week',
    flat: 'no change this week',
    pickAdvice: 'Choose advice:',
    noAdvice: 'No advice published yet. Try again soon.',
    registered: 'Registered: {name}, {community}. Crops: {crops}. Farm: {size}.',
    notRegistered: 'You are not registered yet. Choose 4 on the main menu to ask an agent to visit.',
    confirmVisit: 'Ask a field agent to visit you?\n1 Yes\n2 No',
    visitSent: 'Request sent. An agent will call {phone}. Thank you.',
    weather: 'Today: {min}-{max}°C, {rain}% chance of rain.',
    weatherTip: 'Rain is likely: avoid spraying today.',
    noWeather: 'Weather needs your farm location. Ask an agent to register you.',
    weatherDown: 'Weather is not available right now. Try again later.',
    invalid: 'Invalid choice.',
    bye: 'Thank you for using AgroConnect.',
    back: '0 Back',
    unknown: 'not set',
  },
  tw: {
    main: 'AgroConnect\n1 Gua so boɔ\n2 Kuayɛ ho afotuo\n3 Me din kyerɛw\n4 Frɛ agent ma ɔmmɛsra me\n5 Ɛnnɛ wim tebea\n0 Fi mu',
    pickCrop: 'Nnɔbae bɛn boɔ?',
    noPrice: 'Wɔnkyerɛɛ {crop} boɔ nnya.',
    price: '{crop}: {currency} {price} kg baako ({change}). Wɔyɛɛ no foforɔ {date}.',
    up: 'akɔ soro {n}% nnawɔtwe yi',
    down: 'aba fam {n}% nnawɔtwe yi',
    flat: 'ɛnsesaeɛ nnawɔtwe yi',
    pickAdvice: 'Yi afotuo:',
    noAdvice: 'Afotuo biara nni hɔ nnya. San hwɛ akyiri yi.',
    registered: 'Wɔakyerɛw: {name}, {community}. Nnɔbae: {crops}. Afuo: {size}.',
    notRegistered: 'Wɔnnkyerɛw wo din nnya. Yi 4 wɔ menu so na frɛ agent.',
    confirmVisit: 'Wopɛ sɛ agent bɛsra wo?\n1 Aane\n2 Dabi',
    visitSent: 'Yɛanya wo abisadeɛ. Agent bɛfrɛ {phone}. Meda wo ase.',
    weather: 'Ɛnnɛ: {min}-{max}°C, {rain}% sɛ nsuo bɛtɔ.',
    weatherTip: 'Ebia nsuo bɛtɔ: mmpete aduro ɛnnɛ.',
    noWeather: 'Ɛhia wo afuo beaeɛ. Ma agent nkyerɛw wo din.',
    weatherDown: 'Wim tebea nni hɔ seesei. San sɔ hwɛ akyiri yi.',
    invalid: 'Ɛnyɛ deɛ ɛfata.',
    bye: 'Meda wo ase sɛ wode AgroConnect di dwuma.',
    back: '0 San w\'akyi',
    unknown: 'wɔmfaa nhyɛɛ mu',
  },
  ee: {
    main: 'AgroConnect\n1 Asi dzi nuhohowo\n2 Agbledɔ ŋuti aɖaŋuɖoɖo\n3 Nye ŋkɔŋɔŋlɔ\n4 Bia be agent nava srã wò\n5 Egbe ƒe yame nɔnɔme\n0 Do le eme',
    pickCrop: 'Nuku ka ƒe home?',
    noPrice: 'Womeŋlɔ {crop} ƒe home haɖe o.',
    price: '{crop}: {currency} {price} le kg ɖeka ({change}). Wogbugbɔe wɔ {date}.',
    up: 'eyi dzi {n}% le kwasiɖa sia me',
    down: 'eɖe akpɔtɔ {n}% le kwasiɖa sia me',
    flat: 'metrɔ le kwasiɖa sia me o',
    pickAdvice: 'Tia aɖaŋuɖoɖo:',
    noAdvice: 'Aɖaŋuɖoɖo aɖeke meli haɖe o. Gakpɔ emegbe.',
    registered: 'Woŋlɔ: {name}, {community}. Nukuwo: {crops}. Agble: {size}.',
    notRegistered: 'Womeŋlɔ wò ŋkɔ haɖe o. Tia 4 le menu dzi nàbia agent.',
    confirmVisit: 'Èdi be agent nava srã wòa?\n1 Ɛ̃\n2 Ao',
    visitSent: 'Míexɔ wò biabia. Agent ayɔ {phone}. Akpe.',
    weather: 'Egbe: {min}-{max}°C, {rain}% be tsi adza.',
    weatherTip: 'Tsi ate ŋu adza: mègaƒu atike egbe o.',
    noWeather: 'Ehiã wò agble ƒe teƒe. Na agent naŋlɔ wò ŋkɔ.',
    weatherDown: 'Yame nɔnɔme meli fifia o. Gate kpɔ emegbe.',
    invalid: 'Tiatia sia mesɔ o.',
    bye: 'Akpe be èzã AgroConnect.',
    back: '0 Trɔ yi megbe',
    unknown: 'womeɖoe o',
  },
} satisfies Record<UssdLang, Record<string, string>>

export type UssdKey = keyof (typeof USSD_TEXT)['en']

export const LANGUAGE_MENU = 'AgroConnect\n1 English\n2 Twi\n3 Eʋegbe'

export function say(lang: UssdLang, key: UssdKey, vars: Record<string, string | number> = {}): string {
  return USSD_TEXT[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}
