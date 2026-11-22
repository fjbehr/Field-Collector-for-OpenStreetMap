// Tag presets, based on https://wiki.openstreetmap.org/wiki/Map_features.
//
// This is a curated subset focused on field surveys (including features that
// are common in rural Northern Ghana). Any other tag from Map Features can be
// entered directly in the tag editor; all keys and values are free text.
//
// Preset format: [category, name, tags, geometry, fields, search terms]
//   tags      "key=value;key2=value2"
//   geometry  p = point (node), l = line (open way), a = area (closed way)
//   fields    space-separated field ids (see FIELDS below), "name" is implicit

// ---- fields shown as form inputs ----
// type: text | number | combo | check | tel | url | textarea
const yesNo = ['yes', 'no'];
export const FIELDS = {
  name: { key: 'name', label: 'Name', type: 'text' },
  alt_name: { key: 'alt_name', label: 'Alternative / local name', type: 'text' },
  operator: { key: 'operator', label: 'Operator', type: 'text' },
  operator_type: { key: 'operator:type', label: 'Operator type', type: 'combo', options: ['government', 'community', 'private', 'religious', 'ngo', 'public'] },
  opening_hours: { key: 'opening_hours', label: 'Opening hours', type: 'text', placeholder: 'Mo-Fr 08:00-17:00' },
  phone: { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+233 …' },
  website: { key: 'website', label: 'Website', type: 'url' },
  addr_street: { key: 'addr:street', label: 'Street', type: 'text' },
  addr_housenumber: { key: 'addr:housenumber', label: 'House number', type: 'text' },
  addr_place: { key: 'addr:place', label: 'Address place (village)', type: 'text' },
  addr_city: { key: 'addr:city', label: 'Town / city', type: 'text' },
  ref: { key: 'ref', label: 'Reference / number', type: 'text' },
  description: { key: 'description', label: 'Description', type: 'textarea' },
  start_date: { key: 'start_date', label: 'Start date (year)', type: 'text', placeholder: 'YYYY' },
  access: { key: 'access', label: 'Access', type: 'combo', options: ['yes', 'private', 'permissive', 'customers', 'no'] },
  fee: { key: 'fee', label: 'Fee', type: 'check' },
  capacity: { key: 'capacity', label: 'Capacity', type: 'number' },
  religion: { key: 'religion', label: 'Religion', type: 'combo', options: ['muslim', 'christian', 'animist', 'multifaith', 'none'] },
  denomination: { key: 'denomination', label: 'Denomination', type: 'combo', options: ['sunni', 'ahmadiyya', 'catholic', 'anglican', 'methodist', 'presbyterian', 'pentecostal', 'baptist', 'seventh_day_adventist'] },
  isced_level: { key: 'isced:level', label: 'ISCED level (0 pre-school, 1 primary, 2 JHS, 3 SHS)', type: 'combo', options: ['0', '1', '2', '3', '1;2', '0;1;2'] },
  school_type: { key: 'school:type', label: 'School type', type: 'combo', options: ['public', 'private', 'religious'] },
  healthcare: { key: 'healthcare', label: 'Healthcare type', type: 'combo', options: ['clinic', 'hospital', 'centre', 'pharmacy', 'midwife', 'doctor', 'laboratory', 'alternative'] },
  healthcare_speciality: { key: 'healthcare:speciality', label: 'Speciality', type: 'text', placeholder: 'general;maternity' },
  emergency: { key: 'emergency', label: 'Emergency service', type: 'check' },
  beds: { key: 'beds', label: 'Beds', type: 'number' },
  building: { key: 'building', label: 'Building type', type: 'combo', options: ['yes', 'house', 'hut', 'residential', 'commercial', 'retail', 'school', 'mosque', 'church', 'hospital', 'roof', 'shed', 'farm_auxiliary', 'palace', 'ruins', 'construction'] },
  building_levels: { key: 'building:levels', label: 'Levels (floors)', type: 'number' },
  building_material: { key: 'building:material', label: 'Wall material', type: 'combo', options: ['mud', 'brick', 'cement_block', 'concrete', 'wood', 'metal', 'stone', 'adobe'] },
  roof_material: { key: 'roof:material', label: 'Roof material', type: 'combo', options: ['metal', 'thatch', 'concrete', 'roof_tiles', 'asbestos', 'grass'] },
  roof_shape: { key: 'roof:shape', label: 'Roof shape', type: 'combo', options: ['flat', 'gabled', 'hipped', 'conical', 'pyramidal', 'skillion'] },
  surface: { key: 'surface', label: 'Surface', type: 'combo', options: ['asphalt', 'paved', 'concrete', 'unpaved', 'compacted', 'gravel', 'dirt', 'ground', 'sand', 'grass', 'laterite'] },
  smoothness: { key: 'smoothness', label: 'Smoothness', type: 'combo', options: ['excellent', 'good', 'intermediate', 'bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'] },
  tracktype: { key: 'tracktype', label: 'Track type (grade1 solid … grade5 soft)', type: 'combo', options: ['grade1', 'grade2', 'grade3', 'grade4', 'grade5'] },
  width: { key: 'width', label: 'Width (m)', type: 'number' },
  lanes: { key: 'lanes', label: 'Lanes', type: 'number' },
  oneway: { key: 'oneway', label: 'One way', type: 'check' },
  lit: { key: 'lit', label: 'Lit (street lights)', type: 'check' },
  maxspeed: { key: 'maxspeed', label: 'Max speed (km/h)', type: 'number' },
  bridge: { key: 'bridge', label: 'Bridge', type: 'combo', options: ['yes', 'culvert', 'boardwalk'] },
  layer: { key: 'layer', label: 'Layer', type: 'combo', options: ['-1', '1', '2'] },
  seasonal: { key: 'seasonal', label: 'Seasonal (e.g. only in dry season)', type: 'combo', options: ['no', 'yes', 'dry_season', 'wet_season'] },
  intermittent: { key: 'intermittent', label: 'Intermittent (falls dry)', type: 'check' },
  motor_vehicle: { key: 'motor_vehicle', label: 'Motor vehicles', type: 'combo', options: ['yes', 'no', 'private', 'agricultural', 'destination'] },
  drinking_water: { key: 'drinking_water', label: 'Drinking water', type: 'check' },
  pump: { key: 'pump', label: 'Pump', type: 'combo', options: ['manual', 'powered', 'no'] },
  pump_status: { key: 'pump:status', label: 'Pump status', type: 'combo', options: ['ok', 'broken', 'missing_beam', 'locked'] },
  pump_type: { key: 'pump:type', label: 'Pump type', type: 'combo', options: ['india_mk_ii', 'afridev', 'gravity', 'solar', 'electric'] },
  water_well_type: { key: 'water_well', label: 'Well type', type: 'combo', options: ['borehole', 'dug_well', 'tube_well'] },
  depth: { key: 'depth', label: 'Depth (m)', type: 'number' },
  water_source: { key: 'water_source', label: 'Water source', type: 'combo', options: ['main', 'well', 'water_tank', 'tube_well', 'river', 'water_works', 'spring', 'rain'] },
  water_type: { key: 'water', label: 'Water body type', type: 'combo', options: ['pond', 'reservoir', 'lake', 'river', 'basin', 'stream_pool', 'wastewater'] },
  toilets_disposal: { key: 'toilets:disposal', label: 'Disposal', type: 'combo', options: ['flush', 'pitlatrine', 'chemical', 'bucket', 'kvip'] },
  unisex: { key: 'unisex', label: 'Unisex', type: 'check' },
  wheelchair: { key: 'wheelchair', label: 'Wheelchair accessible', type: 'combo', options: ['yes', 'limited', 'no'] },
  internet_access: { key: 'internet_access', label: 'Internet access', type: 'combo', options: ['no', 'wlan', 'wired', 'terminal', 'yes'] },
  power_supply: { key: 'power_supply', label: 'Power supply', type: 'check' },
  cuisine: { key: 'cuisine', label: 'Cuisine', type: 'text', placeholder: 'local;african' },
  produce: { key: 'produce', label: 'Produce', type: 'text', placeholder: 'maize;yam;groundnut' },
  crop: { key: 'crop', label: 'Crop', type: 'combo', options: ['maize', 'yam', 'rice', 'sorghum', 'millet', 'groundnut', 'soy', 'cassava', 'cotton', 'vegetables', 'cowpea'] },
  irrigated: { key: 'irrigated', label: 'Irrigated', type: 'check' },
  species: { key: 'species', label: 'Species (scientific)', type: 'combo', options: ['Vitellaria paradoxa', 'Parkia biglobosa', 'Adansonia digitata', 'Mangifera indica', 'Azadirachta indica', 'Tamarindus indica', 'Ceiba pentandra', 'Anacardium occidentale', 'Khaya senegalensis'] },
  species_en: { key: 'species:en', label: 'Species (English)', type: 'combo', options: ['Shea tree', 'Dawadawa', 'Baobab', 'Mango', 'Neem', 'Tamarind', 'Kapok', 'Cashew', 'African mahogany'] },
  leaf_type: { key: 'leaf_type', label: 'Leaf type', type: 'combo', options: ['broadleaved', 'needleleaved', 'mixed'] },
  denotation: { key: 'denotation', label: 'Significance', type: 'combo', options: ['landmark', 'natural_monument', 'cluster', 'avenue'] },
  height: { key: 'height', label: 'Height (m)', type: 'number' },
  material: { key: 'material', label: 'Material', type: 'combo', options: ['wood', 'metal', 'concrete', 'stone', 'brick', 'mud', 'plastic', 'thorny_bush'] },
  barrier_height: { key: 'height', label: 'Height (m)', type: 'number' },
  voltage: { key: 'voltage', label: 'Voltage (V)', type: 'text', placeholder: '11000' },
  generator_source: { key: 'generator:source', label: 'Generator source', type: 'combo', options: ['solar', 'diesel', 'hydro', 'wind', 'biomass'] },
  population: { key: 'population', label: 'Population', type: 'number' },
  ele: { key: 'ele', label: 'Elevation (m)', type: 'number' },
  shop_vending: { key: 'vending', label: 'Vending', type: 'text' },
  fuel_diesel: { key: 'fuel:diesel', label: 'Diesel', type: 'check' },
  fuel_octane: { key: 'fuel:octane_91', label: 'Petrol', type: 'check' },
  brand: { key: 'brand', label: 'Brand', type: 'text' },
  sport: { key: 'sport', label: 'Sport', type: 'combo', options: ['soccer', 'basketball', 'volleyball', 'athletics', 'multi'] },
  market_day: { key: 'opening_hours', label: 'Market days', type: 'text', placeholder: 'e.g. every 6 days – describe in note' },
  network: { key: 'network', label: 'Network', type: 'text' },
  route_ref: { key: 'ref', label: 'Road number', type: 'text', placeholder: 'N10' },
  historic_type: { key: 'historic', label: 'Historic type', type: 'combo', options: ['memorial', 'monument', 'ruins', 'archaeological_site', 'castle', 'building'] },
  shelter_type: { key: 'shelter_type', label: 'Shelter type', type: 'combo', options: ['public_transport', 'picnic_shelter', 'weather_shelter', 'basic_hut'] },
  covered: { key: 'covered', label: 'Covered', type: 'check' },
  note: { key: 'note', label: 'Note for other mappers', type: 'textarea' },
};

// [category, name, tags, geometry, fields, terms]
const P = [
  // --- Water & sanitation ---
  ['Water & sanitation', 'Borehole (hand pump)', 'man_made=water_well;water_well=borehole;pump=manual', 'p', 'pump_status pump_type operator operator_type drinking_water depth start_date ref', 'borehole well hand pump pipe water'],
  ['Water & sanitation', 'Mechanised borehole (powered)', 'man_made=water_well;water_well=borehole;pump=powered', 'p', 'pump_status pump_type operator operator_type drinking_water depth start_date', 'solar pump borehole'],
  ['Water & sanitation', 'Dug well', 'man_made=water_well;water_well=dug_well', 'p', 'pump drinking_water seasonal depth', 'open well hand dug'],
  ['Water & sanitation', 'Water tap / standpipe', 'amenity=water_point;man_made=water_tap', 'p', 'operator water_source fee drinking_water', 'standpipe tap pipe water point'],
  ['Water & sanitation', 'Drinking water (fountain/tap)', 'amenity=drinking_water', 'p', 'operator fee', 'drinking water'],
  ['Water & sanitation', 'Water point (refill)', 'amenity=water_point', 'p', 'operator water_source fee drinking_water', 'water point'],
  ['Water & sanitation', 'Water tank / reservoir (covered)', 'man_made=storage_tank;content=water', 'pa', 'operator height capacity', 'polytank tank storage'],
  ['Water & sanitation', 'Water tower', 'man_made=water_tower', 'pa', 'operator height', 'tower'],
  ['Water & sanitation', 'Dam (small reservoir)', 'natural=water;water=reservoir', 'a', 'seasonal intermittent operator', 'dugout dam reservoir pond'],
  ['Water & sanitation', 'Pond / dugout', 'natural=water;water=pond', 'pa', 'seasonal intermittent', 'dugout pond water hole'],
  ['Water & sanitation', 'Public toilet', 'amenity=toilets', 'pa', 'toilets_disposal operator fee unisex wheelchair access', 'latrine kvip toilet'],
  ['Water & sanitation', 'Waste disposal / dump site', 'amenity=waste_disposal', 'pa', 'operator', 'refuse dump rubbish garbage'],
  ['Water & sanitation', 'Waste basket', 'amenity=waste_basket', 'p', '', 'bin trash'],
  ['Water & sanitation', 'Recycling', 'amenity=recycling', 'pa', 'operator', 'recycling'],
  ['Water & sanitation', 'Wastewater plant', 'man_made=wastewater_plant', 'pa', 'operator', 'sewage treatment'],

  // --- Health ---
  ['Health', 'Clinic', 'amenity=clinic;healthcare=clinic', 'pa', 'operator operator_type opening_hours healthcare_speciality emergency beds phone', 'clinic health post'],
  ['Health', 'CHPS compound', 'amenity=clinic;healthcare=clinic', 'pa', 'operator operator_type opening_hours phone', 'chps community health planning services post'],
  ['Health', 'Health centre', 'amenity=clinic;healthcare=centre', 'pa', 'operator operator_type opening_hours beds emergency phone', 'health centre'],
  ['Health', 'Hospital', 'amenity=hospital;healthcare=hospital', 'pa', 'operator operator_type beds emergency phone website', 'hospital'],
  ['Health', 'Pharmacy', 'amenity=pharmacy;healthcare=pharmacy', 'pa', 'operator opening_hours phone', 'chemist drug store'],
  ['Health', 'Chemical seller (licensed)', 'shop=chemist', 'pa', 'opening_hours phone', 'chemical seller drugs'],
  ['Health', 'Maternity home / midwife', 'healthcare=midwife', 'pa', 'operator opening_hours phone', 'maternity midwife'],
  ['Health', 'Doctor', 'amenity=doctors;healthcare=doctor', 'pa', 'healthcare_speciality opening_hours phone', 'doctor'],
  ['Health', 'Dentist', 'amenity=dentist;healthcare=dentist', 'pa', 'opening_hours phone', 'dentist'],
  ['Health', 'Traditional healer / herbalist', 'healthcare=alternative', 'pa', 'healthcare_speciality', 'herbal traditional medicine'],
  ['Health', 'Laboratory', 'healthcare=laboratory', 'pa', 'operator opening_hours', 'lab'],

  // --- Education ---
  ['Education', 'School', 'amenity=school', 'pa', 'isced_level school_type operator operator_type religion addr_place', 'basic primary jhs shs school'],
  ['Education', 'Kindergarten / nursery', 'amenity=kindergarten', 'pa', 'operator operator_type', 'nursery kg pre-school'],
  ['Education', 'University', 'amenity=university', 'pa', 'operator website', 'university uds campus'],
  ['Education', 'College', 'amenity=college', 'pa', 'operator website', 'college training'],
  ['Education', 'Library', 'amenity=library', 'pa', 'operator opening_hours', 'library'],
  ['Education', 'Training centre / vocational', 'amenity=training', 'pa', 'operator', 'vocational training'],
  ['Education', 'Arabic school (Makaranta)', 'amenity=school;religion=muslim', 'pa', 'isced_level operator', 'makaranta islamic arabic'],

  // --- Community & government ---
  ['Community & government', 'Chief’s palace', 'building=palace', 'pa', 'alt_name', 'chief palace traditional authority'],
  ['Community & government', 'Community centre', 'amenity=community_centre', 'pa', 'operator', 'community centre hall'],
  ['Community & government', 'Townhall / district assembly', 'amenity=townhall', 'pa', 'operator', 'assembly district municipal'],
  ['Community & government', 'Government office', 'office=government', 'pa', 'operator opening_hours', 'office ministry'],
  ['Community & government', 'Police station', 'amenity=police', 'pa', 'operator phone', 'police'],
  ['Community & government', 'Fire station', 'amenity=fire_station', 'pa', 'operator phone', 'fire service'],
  ['Community & government', 'Post office', 'amenity=post_office', 'pa', 'operator opening_hours', 'post'],
  ['Community & government', 'Courthouse', 'amenity=courthouse', 'pa', 'operator', 'court'],
  ['Community & government', 'NGO office', 'office=ngo', 'pa', 'operator website phone', 'ngo charity'],
  ['Community & government', 'Cemetery', 'landuse=cemetery', 'a', 'religion', 'graveyard burial'],
  ['Community & government', 'Grave yard (at place of worship)', 'amenity=grave_yard', 'a', 'religion', 'grave'],
  ['Community & government', 'Shelter / meeting tree shade', 'amenity=shelter', 'pa', 'shelter_type', 'shade shelter'],
  ['Community & government', 'Social facility', 'amenity=social_facility', 'pa', 'operator', 'orphanage social'],

  // --- Religion ---
  ['Religion', 'Mosque', 'amenity=place_of_worship;religion=muslim', 'pa', 'denomination', 'mosque islam'],
  ['Religion', 'Church', 'amenity=place_of_worship;religion=christian', 'pa', 'denomination', 'church chapel'],
  ['Religion', 'Shrine (traditional)', 'amenity=place_of_worship', 'pa', 'religion', 'shrine fetish traditional'],
  ['Religion', 'Place of worship', 'amenity=place_of_worship', 'pa', 'religion denomination', 'worship'],

  // --- Shops & trade ---
  ['Shops & trade', 'Market place', 'amenity=marketplace', 'pa', 'market_day operator', 'market'],
  ['Shops & trade', 'Shop (general store)', 'shop=general', 'pa', 'opening_hours phone', 'provisions store'],
  ['Shops & trade', 'Kiosk / container shop', 'shop=kiosk', 'p', 'opening_hours', 'kiosk container'],
  ['Shops & trade', 'Mobile money agent', 'amenity=money_transfer', 'p', 'brand opening_hours phone', 'momo mtn vodafone telecel airteltigo'],
  ['Shops & trade', 'Mobile phone shop', 'shop=mobile_phone', 'pa', 'brand opening_hours', 'phone credit'],
  ['Shops & trade', 'Supermarket', 'shop=supermarket', 'pa', 'brand opening_hours', 'supermarket'],
  ['Shops & trade', 'Grocery / food stuff', 'shop=greengrocer', 'pa', 'opening_hours', 'food vegetables'],
  ['Shops & trade', 'Butcher', 'shop=butcher', 'pa', 'opening_hours', 'meat'],
  ['Shops & trade', 'Bakery', 'shop=bakery', 'pa', 'opening_hours', 'bread'],
  ['Shops & trade', 'Hardware / building materials', 'shop=hardware', 'pa', 'opening_hours', 'cement roofing sheets'],
  ['Shops & trade', 'Agro-input shop', 'shop=agrarian', 'pa', 'opening_hours phone', 'fertilizer seeds agro chemicals'],
  ['Shops & trade', 'Tailor / seamstress', 'shop=tailor', 'pa', 'opening_hours', 'tailor dressmaker'],
  ['Shops & trade', 'Hairdresser / barber', 'shop=hairdresser', 'pa', 'opening_hours', 'barber salon'],
  ['Shops & trade', 'Clothes', 'shop=clothes', 'pa', 'opening_hours', 'clothes fabric'],
  ['Shops & trade', 'Motorcycle shop / repair', 'shop=motorcycle', 'pa', 'opening_hours', 'motorbike okada repair'],
  ['Shops & trade', 'Car repair / fitting shop', 'shop=car_repair', 'pa', 'opening_hours', 'fitter mechanic'],
  ['Shops & trade', 'Bicycle repair', 'shop=bicycle', 'pa', 'opening_hours', 'bicycle'],
  ['Shops & trade', 'Fuel station', 'amenity=fuel', 'pa', 'brand operator fuel_diesel fuel_octane opening_hours', 'petrol filling station'],
  ['Shops & trade', 'Bank', 'amenity=bank', 'pa', 'brand operator opening_hours', 'bank'],
  ['Shops & trade', 'ATM', 'amenity=atm', 'p', 'brand operator', 'cash machine'],
  ['Shops & trade', 'Bureau de change', 'amenity=bureau_de_change', 'pa', 'opening_hours', 'forex'],
  ['Shops & trade', 'Grinding mill', 'craft=grinding_mill', 'pa', 'power_supply operator', 'corn mill grinding'],
  ['Shops & trade', 'Shea butter processing', 'craft=yes;product=shea_butter', 'pa', 'operator', 'shea butter women group'],
  ['Shops & trade', 'Craft workshop', 'craft=yes', 'pa', 'description', 'workshop artisan'],
  ['Shops & trade', 'Blacksmith', 'craft=blacksmith', 'pa', '', 'blacksmith'],
  ['Shops & trade', 'Carpenter', 'craft=carpenter', 'pa', '', 'carpenter'],
  ['Shops & trade', 'Weaver', 'craft=weaver', 'pa', '', 'weaving smock'],
  ['Shops & trade', 'Pottery', 'craft=pottery', 'pa', '', 'pots'],

  // --- Food & drink, tourism ---
  ['Food, drink & tourism', 'Restaurant / chop bar', 'amenity=restaurant', 'pa', 'cuisine opening_hours phone', 'chop bar restaurant'],
  ['Food, drink & tourism', 'Fast food / street food', 'amenity=fast_food', 'pa', 'cuisine opening_hours', 'food stand'],
  ['Food, drink & tourism', 'Bar / drinking spot', 'amenity=bar', 'pa', 'opening_hours', 'drinking spot pito bar'],
  ['Food, drink & tourism', 'Cafe', 'amenity=cafe', 'pa', 'opening_hours', 'cafe'],
  ['Food, drink & tourism', 'Guest house', 'tourism=guest_house', 'pa', 'phone website', 'guest house lodge'],
  ['Food, drink & tourism', 'Hotel', 'tourism=hotel', 'pa', 'phone website', 'hotel'],
  ['Food, drink & tourism', 'Viewpoint', 'tourism=viewpoint', 'p', '', 'view'],
  ['Food, drink & tourism', 'Attraction', 'tourism=attraction', 'pa', 'description', 'attraction sight'],
  ['Food, drink & tourism', 'Information board', 'tourism=information;information=board', 'p', '', 'board sign'],
  ['Food, drink & tourism', 'Museum', 'tourism=museum', 'pa', 'opening_hours', 'museum'],

  // --- Leisure & sport ---
  ['Leisure & sport', 'Football pitch', 'leisure=pitch;sport=soccer', 'pa', 'surface', 'football soccer park field'],
  ['Leisure & sport', 'Sports pitch', 'leisure=pitch', 'pa', 'sport surface', 'pitch court'],
  ['Leisure & sport', 'Stadium', 'leisure=stadium', 'pa', 'sport capacity', 'stadium'],
  ['Leisure & sport', 'Playground', 'leisure=playground', 'pa', '', 'children play'],
  ['Leisure & sport', 'Park', 'leisure=park', 'a', '', 'park garden'],
  ['Leisure & sport', 'Garden', 'leisure=garden', 'a', '', 'garden'],
  ['Leisure & sport', 'Durbar ground / festival ground', 'landuse=recreation_ground', 'a', '', 'durbar ground festival'],

  // --- Transport (roads & paths are lines) ---
  ['Roads & paths', 'Trunk road (national)', 'highway=trunk', 'l', 'route_ref surface smoothness lanes maxspeed lit', 'national road N'],
  ['Roads & paths', 'Primary road', 'highway=primary', 'l', 'route_ref surface smoothness lanes maxspeed', 'primary'],
  ['Roads & paths', 'Secondary road', 'highway=secondary', 'l', 'route_ref surface smoothness lanes', 'secondary'],
  ['Roads & paths', 'Tertiary road', 'highway=tertiary', 'l', 'ref surface smoothness', 'tertiary'],
  ['Roads & paths', 'Unclassified road (connects villages)', 'highway=unclassified', 'l', 'surface smoothness width', 'feeder road minor road village road'],
  ['Roads & paths', 'Residential street', 'highway=residential', 'l', 'surface smoothness lit', 'street'],
  ['Roads & paths', 'Service road', 'highway=service', 'l', 'surface access', 'access road driveway'],
  ['Roads & paths', 'Track (farm / bush road)', 'highway=track', 'l', 'tracktype surface smoothness seasonal motor_vehicle', 'farm road bush track'],
  ['Roads & paths', 'Footpath', 'highway=path', 'l', 'surface smoothness seasonal width', 'path footpath bush path trail'],
  ['Roads & paths', 'Footway (pedestrian)', 'highway=footway', 'l', 'surface lit', 'sidewalk footway'],
  ['Roads & paths', 'Steps', 'highway=steps', 'l', '', 'stairs'],
  ['Roads & paths', 'Bridge (road segment)', 'highway=unclassified;bridge=yes;layer=1', 'l', 'surface width', 'bridge'],
  ['Roads & paths', 'Culvert', 'tunnel=culvert;waterway=ditch', 'l', 'width', 'culvert pipe'],
  ['Roads & paths', 'Ford (river crossing)', 'ford=yes', 'p', 'seasonal', 'ford crossing'],
  ['Roads & paths', 'Speed bump', 'traffic_calming=bump', 'p', '', 'speed ramp'],
  ['Roads & paths', 'Bus stop / lorry stop', 'highway=bus_stop;public_transport=platform', 'p', 'shelter_type covered', 'trotro bus stop'],
  ['Roads & paths', 'Lorry station / bus station', 'amenity=bus_station', 'pa', 'operator', 'lorry park station trotro'],
  ['Roads & paths', 'Taxi rank', 'amenity=taxi', 'pa', '', 'taxi'],
  ['Roads & paths', 'Parking', 'amenity=parking', 'pa', 'surface fee capacity', 'car park'],

  // --- Buildings ---
  ['Buildings', 'Building', 'building=yes', 'a', 'building building_levels building_material roof_material roof_shape addr_housenumber addr_street', 'building'],
  ['Buildings', 'House', 'building=house', 'a', 'building_levels building_material roof_material addr_housenumber', 'house home'],
  ['Buildings', 'Round hut', 'building=hut;roof:shape=conical', 'a', 'building_material roof_material', 'hut round house compound'],
  ['Buildings', 'Granary / farm storage', 'building=farm_auxiliary', 'pa', 'building_material roof_material', 'barn store silo granary'],
  ['Buildings', 'Warehouse', 'building=warehouse', 'a', 'operator', 'warehouse store'],
  ['Buildings', 'Commercial building', 'building=commercial', 'a', 'building_levels', 'office building'],
  ['Buildings', 'Unfinished building', 'building=construction', 'a', 'building_levels', 'construction uncompleted'],
  ['Buildings', 'Ruins', 'building=ruins', 'a', '', 'collapsed ruins'],
  ['Buildings', 'Entrance', 'entrance=yes', 'p', '', 'door gate'],
  ['Buildings', 'Address point', 'addr:housenumber=', 'p', 'addr_housenumber addr_street addr_place addr_city', 'address house number'],

  // --- Land use & agriculture ---
  ['Land use & agriculture', 'Farmland', 'landuse=farmland', 'a', 'crop irrigated produce operator', 'farm field cultivation'],
  ['Land use & agriculture', 'Orchard / plantation', 'landuse=orchard', 'a', 'produce species', 'mango cashew orchard plantation'],
  ['Land use & agriculture', 'Vegetable garden', 'landuse=allotments', 'a', 'produce irrigated', 'dry season garden vegetables'],
  ['Land use & agriculture', 'Irrigation scheme', 'landuse=farmland;irrigated=yes', 'a', 'crop operator', 'irrigation rice scheme'],
  ['Land use & agriculture', 'Residential area', 'landuse=residential', 'a', 'name', 'residential settlement'],
  ['Land use & agriculture', 'Commercial area', 'landuse=commercial', 'a', '', 'commercial'],
  ['Land use & agriculture', 'Industrial area', 'landuse=industrial', 'a', '', 'industrial'],
  ['Land use & agriculture', 'Grazing / meadow', 'landuse=meadow', 'a', '', 'grazing pasture'],
  ['Land use & agriculture', 'Cattle kraal / animal pen', 'landuse=farmyard', 'pa', '', 'kraal kraal cattle pen'],
  ['Land use & agriculture', 'Farmyard', 'landuse=farmyard', 'a', '', 'farmyard'],
  ['Land use & agriculture', 'Forest (managed / plantation)', 'landuse=forest', 'a', 'leaf_type species', 'teak plantation forest reserve'],
  ['Land use & agriculture', 'Quarry / sand winning', 'landuse=quarry', 'a', 'operator', 'quarry sand winning gravel pit'],
  ['Land use & agriculture', 'Construction site', 'landuse=construction', 'a', '', 'construction'],
  ['Land use & agriculture', 'Fish pond / aquaculture', 'landuse=aquaculture', 'a', 'produce', 'fish pond'],
  ['Land use & agriculture', 'Greenhouse', 'landuse=greenhouse_horticulture', 'a', 'produce', 'greenhouse'],

  // --- Nature ---
  ['Nature', 'Tree', 'natural=tree', 'p', 'species species_en leaf_type denotation height', 'tree shea baobab'],
  ['Nature', 'Shea tree', 'natural=tree;species=Vitellaria paradoxa;species:en=Shea tree;leaf_type=broadleaved', 'p', 'denotation height', 'shea tanga'],
  ['Nature', 'Baobab tree', 'natural=tree;species=Adansonia digitata;species:en=Baobab;leaf_type=broadleaved', 'p', 'denotation height', 'baobab'],
  ['Nature', 'Dawadawa tree', 'natural=tree;species=Parkia biglobosa;species:en=African locust bean;leaf_type=broadleaved', 'p', 'denotation height', 'dawadawa locust bean'],
  ['Nature', 'Tree row', 'natural=tree_row', 'l', 'species leaf_type', 'tree row avenue'],
  ['Nature', 'Woodland / bush', 'natural=wood', 'a', 'leaf_type', 'wood bush trees'],
  ['Nature', 'Scrub', 'natural=scrub', 'a', '', 'scrub bush shrubs'],
  ['Nature', 'Grassland / savannah', 'natural=grassland', 'a', '', 'grass savannah'],
  ['Nature', 'Wetland', 'natural=wetland', 'a', 'seasonal', 'swamp marsh wetland'],
  ['Nature', 'Bare rock', 'natural=bare_rock', 'a', '', 'rock outcrop'],
  ['Nature', 'Sand', 'natural=sand', 'a', '', 'sand'],
  ['Nature', 'Water (lake)', 'natural=water', 'a', 'water_type seasonal intermittent', 'lake water'],
  ['Nature', 'Spring', 'natural=spring', 'p', 'seasonal drinking_water', 'spring source'],
  ['Nature', 'Hill / peak', 'natural=peak', 'p', 'ele', 'hill peak mountain'],
  ['Nature', 'Sacred grove', 'natural=wood;sacred=yes', 'a', 'religion', 'sacred grove forest shrine'],
  ['Nature', 'Erosion gully', 'natural=gully', 'l', '', 'gully erosion'],

  // --- Waterways ---
  ['Waterways', 'River', 'waterway=river', 'l', 'intermittent seasonal width', 'river'],
  ['Waterways', 'Stream', 'waterway=stream', 'l', 'intermittent seasonal', 'stream'],
  ['Waterways', 'Drain (lined)', 'waterway=drain', 'l', 'width covered', 'gutter drain'],
  ['Waterways', 'Ditch (unlined)', 'waterway=ditch', 'l', 'width', 'ditch'],
  ['Waterways', 'Canal (irrigation)', 'waterway=canal', 'l', 'width', 'canal irrigation'],
  ['Waterways', 'Dam wall / embankment', 'waterway=dam', 'la', '', 'dam wall'],
  ['Waterways', 'Weir', 'waterway=weir', 'pl', '', 'weir'],

  // --- Barriers ---
  ['Barriers', 'Wall', 'barrier=wall', 'la', 'material barrier_height', 'wall fence'],
  ['Barriers', 'Fence', 'barrier=fence', 'la', 'material barrier_height', 'fence'],
  ['Barriers', 'Hedge', 'barrier=hedge', 'la', 'barrier_height', 'hedge'],
  ['Barriers', 'Gate', 'barrier=gate', 'p', 'access', 'gate'],
  ['Barriers', 'Lift gate / barrier', 'barrier=lift_gate', 'p', 'access', 'barrier boom'],

  // --- Power & telecoms ---
  ['Power & telecoms', 'Power line', 'power=line', 'l', 'voltage operator', 'high voltage line'],
  ['Power & telecoms', 'Minor power line', 'power=minor_line', 'l', 'voltage operator', 'electricity line'],
  ['Power & telecoms', 'Power pole', 'power=pole', 'p', 'ref material', 'pole electricity'],
  ['Power & telecoms', 'Power tower', 'power=tower', 'p', 'ref', 'pylon'],
  ['Power & telecoms', 'Transformer', 'power=transformer', 'p', 'operator voltage', 'transformer'],
  ['Power & telecoms', 'Substation', 'power=substation', 'pa', 'operator voltage', 'substation'],
  ['Power & telecoms', 'Solar panels / generator', 'power=generator;generator:source=solar;generator:method=photovoltaic', 'pa', 'operator', 'solar panel'],
  ['Power & telecoms', 'Generator', 'power=generator', 'pa', 'generator_source operator', 'generator'],
  ['Power & telecoms', 'Street lamp', 'highway=street_lamp', 'p', 'ref', 'street light'],
  ['Power & telecoms', 'Telecom mast', 'man_made=mast;tower:type=communication', 'p', 'operator height', 'mast cell tower antenna'],

  // --- Man made ---
  ['Man made', 'Tower', 'man_made=tower', 'p', 'height', 'tower'],
  ['Man made', 'Silo', 'man_made=silo', 'pa', 'operator', 'silo'],
  ['Man made', 'Survey point', 'man_made=survey_point', 'p', 'ref ele', 'benchmark pillar'],
  ['Man made', 'Flagpole', 'man_made=flagpole', 'p', '', 'flag'],
  ['Man made', 'Monitoring station', 'man_made=monitoring_station', 'p', 'operator', 'weather station gauge'],

  // --- Places ---
  ['Places', 'Village', 'place=village', 'p', 'alt_name population', 'village community'],
  ['Places', 'Hamlet', 'place=hamlet', 'p', 'alt_name population', 'hamlet small settlement'],
  ['Places', 'Town', 'place=town', 'p', 'alt_name population', 'town'],
  ['Places', 'Neighbourhood / suburb', 'place=neighbourhood', 'pa', 'alt_name', 'section quarter neighbourhood'],
  ['Places', 'Isolated farmstead', 'place=isolated_dwelling', 'p', '', 'farmstead isolated'],
  ['Places', 'Locality (named place, no houses)', 'place=locality', 'p', '', 'locality'],

  // --- Historic & emergency ---
  ['Historic & emergency', 'Historic site', 'historic=yes', 'pa', 'historic_type description start_date', 'historic'],
  ['Historic & emergency', 'Memorial', 'historic=memorial', 'p', 'description', 'memorial'],
  ['Historic & emergency', 'Assembly point', 'emergency=assembly_point', 'p', '', 'assembly point'],
  ['Historic & emergency', 'Fire hydrant', 'emergency=fire_hydrant', 'p', 'ref', 'hydrant'],
];

export const GEOM_LABEL = { p: 'Point', l: 'Line', a: 'Area' };

function parseTags(s) {
  const t = {};
  for (const kv of s.split(';')) {
    if (!kv) continue;
    const i = kv.indexOf('=');
    t[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return t;
}

export const PRESETS = P.map(([category, name, tags, geom, fields, terms], i) => ({
  id: i,
  category,
  name,
  tags: parseTags(tags),
  geom,
  fields: ['name', ...fields.split(' ').filter(Boolean)].filter((f, j, a) => a.indexOf(f) === j),
  terms: (terms || '').toLowerCase(),
}));

export const CATEGORIES = [...new Set(PRESETS.map((p) => p.category))];

// Geometry of a feature for preset filtering.
export function featureGeom(f) {
  if (f.type === 'node') return 'p';
  return f.closed ? 'a' : 'l';
}

export function searchPresets(query, geom) {
  const q = query.trim().toLowerCase();
  return PRESETS.filter((p) => {
    if (geom && !p.geom.includes(geom)) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.terms.includes(q) ||
      Object.entries(p.tags).some(([k, v]) => `${k}=${v}`.includes(q))
    );
  });
}

// Find the best matching preset for an existing tag set (most matching tags).
export function matchPreset(tags) {
  let best = null, bestScore = 0;
  for (const p of PRESETS) {
    const entries = Object.entries(p.tags).filter(([, v]) => v !== '');
    if (!entries.length) continue;
    if (entries.every(([k, v]) => tags[k] === v) && entries.length > bestScore) {
      best = p;
      bestScore = entries.length;
    }
  }
  return best;
}

// Display label for a feature: name, else preset name, else first tag.
export function featureLabel(f) {
  const t = f.tags || {};
  if (t.name) return t.name;
  const p = matchPreset(t);
  if (p) return p.name;
  const first = Object.entries(t)[0];
  if (first) return `${first[0]}=${first[1]}`;
  return f.type === 'node' ? 'Untagged point' : 'Untagged way';
}

// Common keys offered in the key autocomplete of the raw tag editor.
export const COMMON_KEYS = [...new Set([
  ...Object.values(FIELDS).map((f) => f.key),
  ...PRESETS.flatMap((p) => Object.keys(p.tags)),
  'amenity', 'shop', 'building', 'highway', 'landuse', 'natural', 'leisure', 'tourism', 'man_made',
  'power', 'waterway', 'barrier', 'craft', 'office', 'healthcare', 'historic', 'place', 'emergency',
  'area', 'service', 'source', 'name:en', 'name:dag', 'official_name', 'old_name', 'level', 'check_date',
  'fixme', 'email', 'contact:phone', 'contact:facebook', 'payment:cash', 'covered', 'indoor',
])].sort();

// Values per key collected from presets & combo fields (offline autocomplete).
export function knownValues(key) {
  const vals = new Set();
  for (const p of PRESETS) if (p.tags[key]) vals.add(p.tags[key]);
  for (const f of Object.values(FIELDS)) if (f.key === key && f.options) f.options.forEach((o) => vals.add(o));
  if (FIELDS[key]?.type === 'check') yesNo.forEach((v) => vals.add(v));
  return [...vals].sort();
}

// Tags that make a closed way an area by default (others need area=yes).
const AREA_KEYS = ['building', 'landuse', 'natural', 'leisure', 'amenity', 'shop', 'tourism', 'man_made', 'place', 'power', 'healthcare', 'office', 'craft', 'historic', 'residential'];
export function isAreaTags(tags) {
  if (tags.area === 'yes') return true;
  if (tags.area === 'no') return false;
  if (tags.highway || tags.barrier || tags.waterway === 'river' || tags.natural === 'tree_row') return false;
  return AREA_KEYS.some((k) => k in tags);
}
