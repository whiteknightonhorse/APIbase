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
import { smithsonianSchemas } from './smithsonian.schema';
import { jplSchemas } from './jpl.schema';
import { soilSchemas } from './soil.schema';
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
import { telnyxSchemas } from './telnyx.schema';
import { swpcSchemas } from './swpc.schema';
import { bibleSchemas } from './bible.schema';
import { gutendexSchemas } from './gutendex.schema';
import { librivoxSchemas } from './librivox.schema';
import { tatoebaSchemas } from './tatoeba.schema';
import { locSchemas } from './loc.schema';
import { ukpoliceSchemas } from './ukpolice.schema';
import { brasilapiSchemas } from './brasilapi.schema';
import { ibgeSchemas } from './ibge.schema';
import { bcbSchemas } from './bcb.schema';
import { eurostatSchemas } from './eurostat.schema';
import { datagovsgSchemas } from './datagovsg.schema';
import { airnowSchemas } from './airnow.schema';
import { npsSchemas } from './nps.schema';
import { eiaSchemas } from './eia.schema';
import { fecSchemas } from './fec.schema';
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
import { absSchemas } from './abs.schema';
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
import { materialsProjectSchemas } from './materials-project.schema';
import { auddSchemas } from './audd.schema';
import { listennotesSchemas } from './listennotes.schema';
import { threatintelSchemas } from './threatintel.schema';
import { marketcheckSchemas } from './marketcheck.schema';
import { zyteSchemas } from './zyte.schema';
import { judge0Schemas } from './judge0.schema';
import { weatherapiSchemas } from './weatherapi.schema';
import { shipengineSchemas } from './shipengine.schema';
import { postcodesIoSchemas } from './postcodes-io.schema';
import { dhlSchemas } from './dhl.schema';
import { adzunaSchemas } from './adzuna.schema';
import { zippopotamusSchemas } from './zippopotamus.schema';
import { balldontlieSchemas } from './balldontlie.schema';
import { theirstackSchemas } from './theirstack.schema';
import { joobleSchemas } from './jooble.schema';
import { arbeitnowSchemas } from './arbeitnow.schema';
import { reedSchemas } from './reed.schema';
import { remotiveSchemas } from './remotive.schema';
import { canopySchemas } from './canopy.schema';
import { spiderSchemas } from './spider.schema';
import { imgflipSchemas } from './imgflip.schema';
import { cocktaildbSchemas } from './cocktaildb.schema';
import { githubApiSchemas } from './github-api.schema';
import { wikidataSchemas } from './wikidata.schema';
import { dictionarySchemas } from './dictionary.schema';
import { noaaSchemas } from './noaa.schema';
import { whoisjsonSchemas } from './whoisjson.schema';
import { npmSchemas } from './npm.schema';
import { osvSchemas } from './osv.schema';
import { censusSchemas } from './census.schema';
import { usaspendingSchemas } from './usaspending.schema';
import { samSchemas } from './sam.schema';
import { femaSchemas } from './fema.schema';
import { pypiSchemas } from './pypi.schema';
import { gbifSchemas } from './gbif.schema';
import { congressSchemas } from './congress.schema';
import { depsdevSchemas } from './depsdev.schema';
import { epaSchemas } from './epa.schema';
import { nceiSchemas } from './ncei.schema';
import { climateSchemas } from './climate.schema';
import { quickchartSchemas } from './quickchart.schema';
import { figiSchemas } from './figi.schema';
import { usnoSchemas } from './usno.schema';
import { wgerSchemas } from './wger.schema';
import { emailVerifySchemas } from './email-verify.schema';
import { solarSchemas } from './solar.schema';
import { issSchemas } from './iss.schema';
import { hfSchemas } from './hf.schema';
import { waterSchemas } from './water.schema';
import { worldbankSchemas } from './worldbank.schema';
import { cdcSchemas } from './cdc.schema';
import { dblpSchemas } from './dblp.schema';
import { tidesSchemas } from './tides.schema';
import { metSchemas } from './met.schema';
import { rijksSchemas } from './rijks.schema';
import { cmaSchemas } from './cma.schema';
import { razorpayifscSchemas } from './razorpayifsc.schema';
import { lichessSchemas } from './lichess.schema';
import { chesscomSchemas } from './chesscom.schema';
import { awcSchemas } from './awc.schema';
import { ukfsaSchemas } from './ukfsa.schema';
import { govukSchemas } from './govuk.schema';
import { scbSchemas } from './scb.schema';
import { irctcSchemas } from './irctc.schema';
import { nvdSchemas } from './nvd.schema';
import { usajobsSchemas } from './usajobs.schema';
import { nrelSchemas } from './nrel.schema';
import { opendotaSchemas } from './opendota.schema';
import { checkwxSchemas } from './checkwx.schema';
import { avwxSchemas } from './avwx.schema';
import { nihreporterSchemas } from './nihreporter.schema';
import { fccSchemas } from './fcc.schema';
import { nasaexoplanetSchemas } from './nasaexoplanet.schema';
import { unsdgSchemas } from './unsdg.schema';
import { dataciteSchemas } from './datacite.schema';
import { ssbnorwaySchemas } from './ssbnorway.schema';
import { overpassSchemas } from './overpass.schema';
import { zenodoSchemas } from './zenodo.schema';
import { nasantrsSchemas } from './nasantrs.schema';
import { cernopendataSchemas } from './cernopendata.schema';
import { celestrakSchemas } from './celestrak.schema';
import { eonetSchemas } from './eonet.schema';
import { rxnormSchemas } from './rxnorm.schema';
import { mygeneSchemas } from './mygene.schema';
import { myvariantSchemas } from './myvariant.schema';
import { mychemSchemas } from './mychem.schema';
import { droughtMonitorSchemas } from './drought-monitor.schema';
import { europepmcSchemas } from './europepmc.schema';
import { rorSchemas } from './ror.schema';
import { catalogueOfLifeSchemas } from './catalogue-of-life.schema';
import { opencontextSchemas } from './opencontext.schema';
import { wtoSchemas } from './wto.schema';
import { inseeSchemas } from './insee.schema';
import { bhlSchemas } from './bhl.schema';
import { gfwSchemas } from './gfw.schema';
import { openstatesSchemas } from './openstates.schema';
import { vamSchemas } from './vam.schema';
import { pharmgkbSchemas } from './pharmgkb.schema';
import { brregSchemas } from './brreg.schema';
import { wormsSchemas } from './worms.schema';
import { bankofcanadaSchemas } from './bankofcanada.schema';
import { opensensemapSchemas } from './opensensemap.schema';
import { openfdaDevicesSchemas } from './openfda-devices.schema';
import { marineSchemas } from './marine.schema';
import { mfapiSchemas } from './mfapi.schema';
import { sdwisSchemas } from './sdwis.schema';
import { blsMacroSchemas } from './bls-macro.schema';
import { mbtaTransitSchemas } from './mbta-transit.schema';
import { unhcrSchemas } from './unhcr.schema';
import { geonamesSchemas } from './geonames.schema';
import { carbonIntensityUkSchemas } from './carbon-intensity-uk.schema';
import { opentopoDataSchemas } from './opentopodata.schema';
import { metNorwaySchemas } from './met-norway.schema';
import { frankfurterSchemas } from './frankfurter.schema';
import { sunrisesunsetSchemas } from './sunrisesunset.schema';
import { pokeapiSchemas } from './pokeapi.schema';
import { samuniSchemas } from './samuni.schema';
import { tvmazeSchemas } from './tvmaze.schema';
import { hackernewsSchemas } from './hackernews.schema';
import { hnalgoliaSchemas } from './hnalgolia.schema';
import { wikipediaSchemas } from './wikipedia.schema';
import { irailSchemas } from './irail.schema';
import { norgesbankSchemas } from './norgesbank.schema';
import { swissfsoSchemas } from './swissfso.schema';
import { treasuryfiscalSchemas } from './treasuryfiscal.schema';
import { usdamarsSchemas } from './usdamars.schema';
import { adsbdbSchemas } from './adsbdb.schema';
import { faoSchemas } from './fao.schema';
import { onsUkStatsSchemas } from './ons-uk-stats.schema';
import { comtradeSchemas } from './comtrade.schema';

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
  ...smithsonianSchemas,
  ...jplSchemas,
  ...soilSchemas,
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
  ...telnyxSchemas,
  ...swpcSchemas,
  ...bibleSchemas,
  ...gutendexSchemas,
  ...librivoxSchemas,
  ...tatoebaSchemas,
  ...locSchemas,
  ...ukpoliceSchemas,
  ...brasilapiSchemas,
  ...ibgeSchemas,
  ...bcbSchemas,
  ...eurostatSchemas,
  ...datagovsgSchemas,
  ...airnowSchemas,
  ...npsSchemas,
  ...eiaSchemas,
  ...fecSchemas,
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
  ...absSchemas,
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
  ...materialsProjectSchemas,
  ...auddSchemas,
  ...listennotesSchemas,
  ...threatintelSchemas,
  ...marketcheckSchemas,
  ...zyteSchemas,
  ...judge0Schemas,
  ...weatherapiSchemas,
  ...shipengineSchemas,
  ...postcodesIoSchemas,
  ...dhlSchemas,
  ...adzunaSchemas,
  ...zippopotamusSchemas,
  ...balldontlieSchemas,
  ...theirstackSchemas,
  ...joobleSchemas,
  ...arbeitnowSchemas,
  ...reedSchemas,
  ...remotiveSchemas,
  ...canopySchemas,
  ...spiderSchemas,
  ...imgflipSchemas,
  ...cocktaildbSchemas,
  ...githubApiSchemas,
  ...wikidataSchemas,
  ...dictionarySchemas,
  ...noaaSchemas,
  ...whoisjsonSchemas,
  ...npmSchemas,
  ...osvSchemas,
  ...censusSchemas,
  ...usaspendingSchemas,
  ...samSchemas,
  ...femaSchemas,
  ...pypiSchemas,
  ...gbifSchemas,
  ...congressSchemas,
  ...depsdevSchemas,
  ...epaSchemas,
  ...nceiSchemas,
  ...climateSchemas,
  ...quickchartSchemas,
  ...figiSchemas,
  ...usnoSchemas,
  ...wgerSchemas,
  ...emailVerifySchemas,
  ...solarSchemas,
  ...issSchemas,
  ...hfSchemas,
  ...waterSchemas,
  ...worldbankSchemas,
  ...cdcSchemas,
  ...dblpSchemas,
  ...tidesSchemas,
  ...metSchemas,
  ...rijksSchemas,
  ...cmaSchemas,
  ...razorpayifscSchemas,
  ...lichessSchemas,
  ...chesscomSchemas,
  ...awcSchemas,
  ...ukfsaSchemas,
  ...govukSchemas,
  ...scbSchemas,
  ...irctcSchemas,
  ...nvdSchemas,
  ...usajobsSchemas,
  ...nrelSchemas,
  ...opendotaSchemas,
  ...checkwxSchemas,
  ...avwxSchemas,
  ...nihreporterSchemas,
  ...fccSchemas,
  ...nasaexoplanetSchemas,
  ...unsdgSchemas,
  ...dataciteSchemas,
  ...ssbnorwaySchemas,
  ...overpassSchemas,
  ...zenodoSchemas,
  ...nasantrsSchemas,
  ...cernopendataSchemas,
  ...celestrakSchemas,
  ...eonetSchemas,
  ...rxnormSchemas,
  ...mygeneSchemas,
  ...myvariantSchemas,
  ...mychemSchemas,
  ...droughtMonitorSchemas,
  ...europepmcSchemas,
  ...rorSchemas,
  ...catalogueOfLifeSchemas,
  ...opencontextSchemas,
  ...wtoSchemas,
  ...inseeSchemas,
  ...bhlSchemas,
  ...gfwSchemas,
  ...openstatesSchemas,
  ...vamSchemas,
  ...pharmgkbSchemas,
  ...brregSchemas,
  ...wormsSchemas,
  ...bankofcanadaSchemas,
  ...opensensemapSchemas,
  ...openfdaDevicesSchemas,
  ...marineSchemas,
  ...mfapiSchemas,
  ...sdwisSchemas,
  ...blsMacroSchemas,
  ...mbtaTransitSchemas,
  ...unhcrSchemas,
  ...geonamesSchemas,
  ...carbonIntensityUkSchemas,
  ...opentopoDataSchemas,
  ...metNorwaySchemas,
  ...frankfurterSchemas,
  ...sunrisesunsetSchemas,
  ...pokeapiSchemas,
  ...samuniSchemas,
  ...tvmazeSchemas,
  ...hackernewsSchemas,
  ...hnalgoliaSchemas,
  ...wikipediaSchemas,
  ...irailSchemas,
  ...norgesbankSchemas,
  ...swissfsoSchemas,
  ...treasuryfiscalSchemas,
  ...usdamarsSchemas,
  ...adsbdbSchemas,
  ...faoSchemas,
  ...onsUkStatsSchemas,
  ...comtradeSchemas,
};
