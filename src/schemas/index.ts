import { type ZodSchema } from 'zod';
import { weatherSchemas } from './weather.schema';
import { cryptoSchemas } from './crypto.schema';
import { polymarketSchemas } from './polymarket.schema';
import { aviasalesSchemas } from './aviasales.schema';
import { sabreSchemas } from './sabre.schema';
import { amadeusSchemas } from './amadeus.schema';
import { hyperliquidSchemas } from './hyperliquid.schema';
import { asterdexSchemas } from './asterdex.schema';
import { foursquareSchemas } from './foursquare.schema';
import { ticketmasterSchemas } from './ticketmaster.schema';
import { tmdbSchemas } from './tmdb.schema';
import { healthSchemas } from './health.schema';
import { financeSchemas } from './finance.schema';
import { musicSchemas } from './music.schema';
import { jobsSchemas } from './jobs.schema';
import { educationSchemas } from './education.schema';
import { geoSchemas } from './geo.schema';
import { aipushSchemas } from './aipush.schema';
import { diffbotSchemas } from './diffbot.schema';
import { whoisxmlSchemas } from './whoisxml.schema';
import { spoonacularSchemas } from './spoonacular.schema';
import { nasaSchemas } from './nasa.schema';
import { jplSchemas } from './jpl.schema';
import { rawgSchemas } from './rawg.schema';
import { igdbSchemas } from './igdb.schema';
import { qrserverSchemas } from './qrserver.schema';
import { upcitemdbSchemas } from './upcitemdb.schema';
import { ipapiSchemas } from './ipapi.schema';
import { usgsEarthquakeSchemas } from './usgs-earthquake.schema';
import { jikanSchemas } from './jikan.schema';
import { openlibrarySchemas } from './openlibrary.schema';
import { zerobounceSchemas } from './zerobounce.schema';
import { walkscoreSchemas } from './walkscore.schema';
import { usrealestateSchemas } from './usrealestate.schema';
import { serperSchemas } from './serper.schema';
import { tavilySchemas } from './tavily.schema';
import { exaSchemas } from './exa.schema';
import { newsdataSchemas } from './newsdata.schema';
import { finnhubSchemas } from './finnhub.schema';
import { ocrspaceSchemas } from './ocrspace.schema';
import { regulationsSchemas } from './regulations.schema';
import { mastodonSchemas } from './mastodon.schema';
import { stabilitySchemas } from './stability.schema';
import { twilioSchemas } from './twilio.schema';
import { langblySchemas } from './langbly.schema';
import { apisportsSchemas } from './apisports.schema';
import { apiflashSchemas } from './apiflash.schema';
import { timeapiSchemas } from './timeapi.schema';
import { gdeltSchemas } from './gdelt.schema';
import { nwsSchemas } from './nws.schema';
import { exchangerateSchemas } from './exchangerate.schema';
import { shortioSchemas } from './shortio.schema';
import { calendarificSchemas } from './calendarific.schema';
import { nagerdateSchemas } from './nagerdate.schema';
import { sslcheckerSchemas } from './sslchecker.schema';
import { nhtsaSchemas } from './nhtsa.schema';
import { restcountriesSchemas } from './restcountries.schema';
import { openfoodfactsSchemas } from './openfoodfacts.schema';
import { randomuserSchemas } from './randomuser.schema';
import { iqairSchemas } from './iqair.schema';
import { fatsecretSchemas } from './fatsecret.schema';
import { hunterSchemas } from './hunter.schema';
import { autodevSchemas } from './autodev.schema';
import { geocodioSchemas } from './geocodio.schema';
import { podcastindexSchemas } from './podcastindex.schema';
import { api2pdfSchemas } from './api2pdf.schema';
import { convertapiSchemas } from './convertapi.schema';
import { europeanaSchemas } from './europeana.schema';
import { articSchemas } from './artic.schema';
import { blueskySchemas } from './bluesky.schema';
import { edgarSchemas } from './edgar.schema';
import { companiesHouseSchemas } from './companies-house.schema';
import { gleifSchemas } from './gleif.schema';
import { assemblyaiSchemas } from './assemblyai.schema';
import { vatcomplySchemas } from './vatcomply.schema';
import { cloudflareSchemas } from './cloudflare.schema';
import { namesiloSchemas } from './namesilo.schema';
import { clinicaltrialsSchemas } from './clinicaltrials.schema';
import { telegramSchemas } from './telegram.schema';
import { browserbaseSchemas } from './browserbase.schema';
import { pexelsSchemas } from './pexels.schema';
import { firmsSchemas } from './firms.schema';
import { resendSchemas } from './resend.schema';
import { fedregisterSchemas } from './fedregister.schema';
import { courtlistenerSchemas } from './courtlistener.schema';
import { fdicSchemas } from './fdic.schema';
import { diseaseSchemas } from './disease.schema';
import { whoSchemas } from './who.schema';
import { gdacsSchemas } from './gdacs.schema';
import { rateapiSchemas } from './rateapi.schema';
import { twitterapiSchemas } from './twitterapi.schema';
import { currentsSchemas } from './currents.schema';
import { ibanapiSchemas } from './ibanapi.schema';
import { pubchemSchemas } from './pubchem.schema';
import { openchargemapSchemas } from './openchargemap.schema';
import { ipqsSchemas } from './ipqs.schema';
import { accountSchemas } from './account.schema';
import { platformSchemas } from './platform.schema';
import { rcsbSchemas } from './rcsb.schema';
import { nhtsaSafetySchemas } from './nhtsa-safety.schema';
import { cactusSchemas } from './cactus.schema';
import { trackingSchemas } from './17track.schema';

export const toolSchemas: Record<string, ZodSchema> = {
  ...weatherSchemas,
  ...cryptoSchemas,
  ...polymarketSchemas,
  ...aviasalesSchemas,
  ...sabreSchemas,
  ...amadeusSchemas,
  ...hyperliquidSchemas,
  ...asterdexSchemas,
  ...foursquareSchemas,
  ...ticketmasterSchemas,
  ...tmdbSchemas,
  ...healthSchemas,
  ...financeSchemas,
  ...musicSchemas,
  ...jobsSchemas,
  ...educationSchemas,
  ...geoSchemas,
  ...aipushSchemas,
  ...diffbotSchemas,
  ...whoisxmlSchemas,
  ...spoonacularSchemas,
  ...nasaSchemas,
  ...jplSchemas,
  ...rawgSchemas,
  ...igdbSchemas,
  ...qrserverSchemas,
  ...upcitemdbSchemas,
  ...ipapiSchemas,
  ...usgsEarthquakeSchemas,
  ...jikanSchemas,
  ...openlibrarySchemas,
  ...zerobounceSchemas,
  ...walkscoreSchemas,
  ...usrealestateSchemas,
  ...serperSchemas,
  ...tavilySchemas,
  ...exaSchemas,
  ...newsdataSchemas,
  ...finnhubSchemas,
  ...ocrspaceSchemas,
  ...regulationsSchemas,
  ...mastodonSchemas,
  ...stabilitySchemas,
  ...twilioSchemas,
  ...langblySchemas,
  ...apisportsSchemas,
  ...apiflashSchemas,
  ...timeapiSchemas,
  ...gdeltSchemas,
  ...nwsSchemas,
  ...exchangerateSchemas,
  ...shortioSchemas,
  ...calendarificSchemas,
  ...nagerdateSchemas,
  ...sslcheckerSchemas,
  ...nhtsaSchemas,
  ...restcountriesSchemas,
  ...openfoodfactsSchemas,
  ...randomuserSchemas,
  ...iqairSchemas,
  ...fatsecretSchemas,
  ...hunterSchemas,
  ...autodevSchemas,
  ...geocodioSchemas,
  ...podcastindexSchemas,
  ...api2pdfSchemas,
  ...convertapiSchemas,
  ...europeanaSchemas,
  ...articSchemas,
  ...blueskySchemas,
  ...edgarSchemas,
  ...companiesHouseSchemas,
  ...gleifSchemas,
  ...assemblyaiSchemas,
  ...vatcomplySchemas,
  ...cloudflareSchemas,
  ...namesiloSchemas,
  ...clinicaltrialsSchemas,
  ...telegramSchemas,
  ...browserbaseSchemas,
  ...pexelsSchemas,
  ...firmsSchemas,
  ...resendSchemas,
  ...fedregisterSchemas,
  ...courtlistenerSchemas,
  ...fdicSchemas,
  ...diseaseSchemas,
  ...whoSchemas,
  ...gdacsSchemas,
  ...rateapiSchemas,
  ...twitterapiSchemas,
  ...currentsSchemas,
  ...ibanapiSchemas,
  ...pubchemSchemas,
  ...openchargemapSchemas,
  ...ipqsSchemas,
  ...accountSchemas,
  ...platformSchemas,
  ...rcsbSchemas,
  ...nhtsaSafetySchemas,
  ...cactusSchemas,
  ...trackingSchemas,
};
