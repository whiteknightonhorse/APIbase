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
import { zincSchemas } from './zinc.schema';
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
  ...zincSchemas,
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
};
