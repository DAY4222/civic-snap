#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_JSON = path.join(ROOT, 'data/toronto-311-target-issues.json');
const APP_CATALOG_TS = path.join(ROOT, 'lib/generated/issueCatalog.ts');
const CATEGORY_TITLE_IDS_TS = path.join(ROOT, 'lib/generated/categoryTitleIds.ts');
const EDGE_CATALOG_TS = path.join(ROOT, 'supabase/functions/analyze-photo-labels/issueCatalog.ts');
const PHOTO_LABELS_JSON = path.join(ROOT, 'data/generated/photo-label-taxonomy.json');
const EDGE_CATALOG_JSON = path.join(ROOT, 'data/generated/edge-issue-catalog.json');

const ISSUE_CATALOG_VERSION = 'toronto-311-ai-issue-catalog-v2';
const PHOTO_LABEL_TAXONOMY_VERSION = 'photo-label-taxonomy-v3';

const DISCOVERABILITY = {
  PHOTO: 'photo',
  LIMITED: 'limited-context',
  NONE: 'not-discoverable',
};

const PHOTO_LABELS = [
  ['roadway', 'Roadway', 'Roadway, traffic lane, curb lane, or road shoulder.'],
  ['sidewalk', 'Sidewalk', 'Sidewalk or pedestrian walking area.'],
  ['boulevard', 'Boulevard', 'Boulevard or grass strip between curb and sidewalk.'],
  ['laneway', 'Laneway', 'Public laneway or service lane.'],
  ['bike-lane', 'Bike lane', 'Bike lane or cycling facility.'],
  ['intersection', 'Intersection', 'Street intersection, crosswalk, or corner.'],
  ['bus-stop', 'Bus stop', 'Transit stop or shelter area.'],
  ['school-zone', 'School zone', 'School frontage or signed school zone.'],
  ['city-park', 'City park', 'City park, playground, or park trail.'],
  ['private-property', 'Private property', 'Private yard, driveway, building, or lot.'],
  ['residential-curb', 'Residential curb', 'Residential curbside set-out area.'],
  ['road-pothole', 'Road pothole', 'Visible pothole in the road surface.'],
  ['road-surface-damage', 'Road surface damage', 'Cracked, broken, uneven, or damaged road surface.'],
  ['road-sinking-or-sinkhole', 'Road sinking or sinkhole', 'Sunken road surface, sinkhole, or collapse.'],
  ['damaged-concrete-sidewalk', 'Damaged concrete sidewalk', 'Cracked, broken, raised, or sunken concrete sidewalk.'],
  ['uneven-walkway', 'Uneven walkway', 'Damaged, uneven, or unsafe walkway.'],
  ['damaged-boulevard-asphalt', 'Damaged boulevard asphalt', 'Damaged asphalt on a boulevard or driveway apron.'],
  ['catch-basin', 'Catch basin', 'Catch basin, sewer grate, or storm drain.'],
  ['maintenance-hole-lid', 'Maintenance hole lid', 'Loose, missing, sunken, or damaged maintenance hole cover.'],
  ['traffic-signal', 'Traffic signal', 'Traffic signal light, pole, housing, or push button.'],
  ['traffic-sign', 'Traffic sign', 'Traffic sign or signpost.'],
  ['street-name-sign', 'Street name sign', 'Street name sign.'],
  ['regulatory-or-warning-sign', 'Regulatory or warning sign', 'Stop, parking, speed, warning, or regulatory sign.'],
  ['bike-lane-bollard-or-barrier', 'Bike lane bollard or barrier', 'Bike lane bollard, post, curb, or barrier.'],
  ['residential-collection-bin', 'Residential collection bin', 'City-issued residential collection bin.'],
  ['garbage-bin', 'Garbage bin', 'Garbage bin or black/grey waste bin.'],
  ['recycling-bin', 'Recycling bin', 'Blue recycling bin.'],
  ['organic-bin', 'Organic bin', 'Green organic waste bin.'],
  ['street-litter-bin', 'Street litter bin', 'Public street litter bin.'],
  ['bin-lid-damaged', 'Bin lid damaged', 'Damaged or missing collection-bin lid.'],
  ['bin-body-or-handle-damaged', 'Bin body or handle damaged', 'Damaged collection-bin body or handle.'],
  ['bin-wheel-damaged', 'Bin wheel damaged', 'Damaged or missing collection-bin wheel.'],
  ['overflowing-street-litter-bin', 'Overflowing street litter bin', 'Public street litter bin full or overflowing.'],
  ['curbside-garbage', 'Curbside garbage', 'Garbage set out at the curb.'],
  ['curbside-recycling', 'Curbside recycling', 'Recycling set out at the curb.'],
  ['curbside-organics', 'Curbside organics', 'Organic waste set out at the curb.'],
  ['multiple-curbside-setouts', 'Multiple curbside set-outs', 'Multiple neighbouring curbside set-outs visible on the same street.'],
  ['yard-waste', 'Yard waste', 'Yard waste bags, bundles, or containers.'],
  ['oversized-or-electronic-item', 'Oversized or electronic item', 'Large item, appliance, furniture, mattress, or electronics set out.'],
  ['household-hazardous-waste', 'Household hazardous waste', 'Paint, chemicals, batteries, propane, or other hazardous waste.'],
  ['loose-litter', 'Loose litter', 'Loose scattered litter or small debris.'],
  ['illegal-dumping', 'Illegal dumping', 'Dumped waste, bags, furniture, or debris not part of normal set-out.'],
  ['construction-debris', 'Construction debris', 'Construction material, renovation waste, concrete, wood, drywall, or spill.'],
  ['roadway-debris', 'Roadway debris', 'Debris, litter, or material visibly on a roadway or curb lane.'],
  ['sidewalk-boulevard-litter', 'Sidewalk or boulevard litter', 'Litter or debris visibly on a sidewalk or boulevard.'],
  ['laneway-litter', 'Laneway litter', 'Litter or debris visibly in a public laneway.'],
  ['construction-spill-on-road', 'Construction spill on road', 'Construction material or spill visibly on a roadway.'],
  ['needles-or-syringes', 'Needles or syringes', 'Needle or syringe visible in the scene.'],
  ['biohazard-human-waste', 'Biohazard human waste', 'Visible human waste or biohazard cleanup concern.'],
  ['snow-covered-road', 'Snow-covered road', 'Road that appears snow-covered or uncleared.'],
  ['icy-road', 'Icy road', 'Road surface that appears icy and needs salting.'],
  ['snow-covered-sidewalk', 'Snow-covered sidewalk', 'Sidewalk that appears snow-covered or uncleared.'],
  ['icy-sidewalk', 'Icy sidewalk', 'Sidewalk that appears icy or needs salting.'],
  ['icy-laneway', 'Icy laneway', 'Laneway that appears icy or needs salting.'],
  ['snow-dumped-on-public-sidewalk', 'Snow dumped on public sidewalk', 'Snow piled or dumped from private property onto a public sidewalk.'],
  ['snowbank-blocking-driveway', 'Snowbank blocking driveway', 'Plowed snowbank blocking driveway access.'],
  ['snow-blocking-intersection-sightline', 'Snow blocking intersection sightline', 'Snowbank obstructing intersection visibility or mobility.'],
  ['snow-covered-bus-stop', 'Snow-covered bus stop', 'Bus stop or shelter area blocked by snow.'],
  ['snow-covered-school-zone', 'Snow-covered school zone', 'School-zone sidewalk or frontage blocked by snow.'],
  ['snow-covered-bike-lane', 'Snow-covered bike lane', 'Bike lane blocked by snow or ice.'],
  ['snow-plow-boulevard-damage', 'Snow plow boulevard damage', 'Boulevard or lawn damage likely caused by plowing.'],
  ['public-tree', 'Public tree', 'Street tree, park tree, or tree on City property.'],
  ['private-tree', 'Private tree', 'Tree on private property.'],
  ['fallen-tree-or-large-limb', 'Fallen tree or large limb', 'Fallen tree or large branch.'],
  ['hanging-or-broken-branch', 'Hanging or broken branch', 'Broken, hanging, split, or hazardous branch.'],
  ['tree-pruning-needed', 'Tree pruning needed', 'Visible tree growth or limbs suggesting pruning is needed.'],
  ['tree-removal-or-injury', 'Tree removal or injury', 'Tree removal, cutting, damage, or injury evidence.'],
  ['tree-roots-trip-hazard', 'Tree roots trip hazard', 'Tree roots causing sidewalk or walking-surface hazard.'],
  ['fallen-tree-blocking-road-or-sidewalk', 'Fallen tree blocking road or sidewalk', 'Fallen tree or large limb blocking a road, sidewalk, or public path.'],
  ['hazardous-hanging-limb-over-public-way', 'Hazardous limb over public way', 'Broken or hanging limb visibly over a road, sidewalk, or public path.'],
  ['private-hazardous-tree', 'Private hazardous tree', 'Private tree visibly leaning, split, or with large hazardous limbs.'],
  ['long-grass-or-prohibited-plants', 'Long grass or prohibited plants', 'Long grass, weeds, or prohibited plants on property.'],
  ['private-property-waste', 'Private property waste', 'Waste, debris, or dumping on private property.'],
  ['private-property-disrepair', 'Private property disrepair', 'Visible exterior disrepair on private property.'],
  ['graffiti-private-property', 'Graffiti on private property', 'Graffiti visible on private property.'],
  ['poster-on-public-asset', 'Poster on public asset', 'Poster, flyer, sticker, or sign attached to public property.'],
  ['unpermitted-sign', 'Unpermitted sign', 'Temporary, portable, or possibly unpermitted sign.'],
  ['damaged-or-missing-traffic-sign', 'Damaged or missing traffic sign', 'Traffic sign visibly damaged, knocked down, missing, or unreadable.'],
  ['faded-or-obstructed-sign', 'Faded or obstructed sign', 'Traffic or street sign visibly faded, blocked, or hard to read.'],
  ['street-name-sign-damaged', 'Street name sign damaged', 'Street name sign visibly damaged, missing, faded, or unreadable.'],
  ['regulatory-sign-damaged', 'Regulatory sign damaged', 'Stop, parking, speed, warning, or regulatory sign visibly damaged or missing.'],
  ['encroachment-on-city-property', 'Encroachment on City property', 'Object, fence, landscaping, or structure encroaching on City property.'],
  ['illegal-off-street-parking', 'Illegal off-street parking', 'Vehicle parked on lawn, boulevard, or other off-street area.'],
  ['construction-site', 'Construction site', 'Construction activity, site, equipment, or hoarding.'],
  ['standing-water-private-property', 'Standing water on private property', 'Standing water visible on private property.'],
  ['injured-wildlife', 'Injured wildlife', 'Wildlife that appears injured or distressed.'],
  ['dead-wildlife', 'Dead wildlife', 'Dead wild animal.'],
  ['dead-domestic-animal', 'Dead domestic animal', 'Dead domestic animal.'],
  ['stray-dog', 'Stray dog', 'Dog at large or apparently stray.'],
  ['dog-off-leash', 'Dog off leash', 'Dog off leash in a park or public space.'],
  ['confined-stray-animal', 'Confined stray animal', 'Stray animal confined in a yard, room, vehicle, or enclosure.'],
  ['surface-watermain-break', 'Surface watermain break', 'Water surfacing, flowing, pooling, or spraying from a possible watermain break.'],
  ['large-water-flow-on-road', 'Large water flow on road', 'Large volume of water flowing or pooling on a road, sidewalk, or boulevard.'],
  ['water-service-box', 'Water service box', 'Water service box, curb stop, or related water-service cover.'],
  ['water-leaking-from-service-box', 'Water leaking from service box', 'Water visibly leaking, bubbling, or pooling from a water service box.'],
  ['water-service-box-damaged', 'Water service box damaged', 'Water service box or cover visibly damaged, missing, raised, or sunken.'],
  ['sewer-cleanout', 'Sewer cleanout', 'Sewer cleanout, basement drain, or visible sewer service access.'],
  ['sunken-road-surface', 'Sunken road surface', 'Road surface visibly sunken or depressed without an open hole.'],
  ['open-sinkhole', 'Open sinkhole', 'Open hole or collapse in a road or paved surface.'],
].map(([id, label, description]) => ({ id, label, description }));

const ISSUE_RULES = {
  'Residential Bin Lid Damaged': rule(DISCOVERABILITY.PHOTO, ['bin-lid-damaged'], ['residential-collection-bin', 'garbage-bin', 'recycling-bin', 'organic-bin'], {
    photoHint: 'Visible residential collection bin lid damage or missing lid.',
  }),
  'Road Pothole / Road Damage': rule(DISCOVERABILITY.PHOTO, ['road-pothole', 'road-surface-damage'], ['roadway', 'bike-lane'], {
    photoHint: 'Visible pothole, broken asphalt, or damaged pavement in a road or bike lane.',
    suppressionGroup: 'road-surface-defect',
  }),
  'Property Standards and Maintenance Violations': rule(DISCOVERABILITY.LIMITED, ['private-property-disrepair', 'private-property-waste', 'standing-water-private-property'], ['private-property', 'long-grass-or-prohibited-plants'], {
    photoHint: 'Visible private-property exterior disrepair, waste accumulation, or standing water.',
  }),
  'Sidewalk Snow Clearing Required': rule(DISCOVERABILITY.PHOTO, ['snow-covered-sidewalk'], ['sidewalk'], {
    suppressionGroup: 'sidewalk-snow-ice',
  }),
  'Injured - Wildlife': rule(DISCOVERABILITY.PHOTO, ['injured-wildlife'], []),
  'Pick up Dead Wildlife': rule(DISCOVERABILITY.PHOTO, ['dead-wildlife'], []),
  'Road Plowing Request': rule(DISCOVERABILITY.PHOTO, ['snow-covered-road'], ['roadway'], {
    suppressionGroup: 'road-winter-maintenance',
  }),
  'General Pruning': rule(DISCOVERABILITY.PHOTO, ['tree-pruning-needed'], ['public-tree', 'hanging-or-broken-branch'], {
    photoHint: 'Visible public tree limbs or growth needing pruning, without an immediate blockage or hazard.',
    suppressionGroup: 'tree-maintenance',
  }),
  'Residential - Garbage Day Collection - Not Picked Up': rule(DISCOVERABILITY.LIMITED, ['curbside-garbage'], ['garbage-bin', 'residential-curb'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['residential-curb'],
    photoHint: 'Garbage set out at a residential curb; pickup timing still needs confirmation.',
    suppressionGroup: 'missed-garbage',
  }),
  'Residential Bin Body or Handle Damaged': rule(DISCOVERABILITY.PHOTO, ['bin-body-or-handle-damaged'], ['residential-collection-bin', 'garbage-bin', 'recycling-bin', 'organic-bin']),
  'Driveway Blocked By Plowed Snowbank': rule(DISCOVERABILITY.PHOTO, ['snowbank-blocking-driveway'], []),
  'Residential Oversized/Electronics Item Day Collection Not Picked Up': rule(DISCOVERABILITY.LIMITED, ['oversized-or-electronic-item'], ['residential-curb'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['residential-curb'],
    photoHint: 'Oversized item or electronics set out at a residential curb; pickup timing still needs confirmation.',
    suppressionGroup: 'missed-oversized',
  }),
  'Waste or Illegal Dumping on Private Property': rule(DISCOVERABILITY.PHOTO, ['private-property-waste'], ['private-property', 'illegal-dumping']),
  'Residential Organics Not Picked Up': rule(DISCOVERABILITY.LIMITED, ['curbside-organics'], ['organic-bin', 'residential-curb'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['residential-curb'],
    photoHint: 'Organics set out at a residential curb; pickup timing still needs confirmation.',
    suppressionGroup: 'missed-organics',
  }),
  'Tree Emergency Clean-Up': rule(DISCOVERABILITY.PHOTO, ['fallen-tree-blocking-road-or-sidewalk', 'hazardous-hanging-limb-over-public-way'], ['fallen-tree-or-large-limb', 'hanging-or-broken-branch', 'public-tree', 'roadway', 'sidewalk'], {
    photoHint: 'Fallen tree or hazardous limb visibly blocking or threatening a public road, sidewalk, or path.',
    suppressionGroup: 'tree-hazard',
  }),
  'Clean up Illegal Dumping on City Road Allowance': rule(DISCOVERABILITY.PHOTO, ['illegal-dumping', 'biohazard-human-waste'], ['roadway', 'sidewalk', 'boulevard', 'laneway', 'oversized-or-electronic-item', 'construction-debris'], {
    photoHint: 'Dumped waste or biohazard on a public road allowance, not normal residential set-out.',
  }),
  'Sewer Service Line-Blocked': rule(DISCOVERABILITY.LIMITED, ['sewer-cleanout'], ['surface-watermain-break']),
  'Clean up Debris on Road': rule(DISCOVERABILITY.PHOTO, ['roadway-debris', 'construction-spill-on-road'], ['roadway', 'construction-debris', 'loose-litter'], {
    photoHint: 'Debris, litter, or construction spill visibly on a road or curb lane.',
  }),
  'Residential - Recycling Day Collection - Not Picked Up': rule(DISCOVERABILITY.LIMITED, ['curbside-recycling'], ['recycling-bin', 'residential-curb'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['residential-curb'],
    photoHint: 'Recycling set out at a residential curb; pickup timing still needs confirmation.',
    suppressionGroup: 'missed-recycling',
  }),
  'Traffic Signal Repair': rule(DISCOVERABILITY.PHOTO, ['traffic-signal'], ['intersection']),
  'Hazardous Waste Pick-up': rule(DISCOVERABILITY.PHOTO, ['household-hazardous-waste'], []),
  'Zoning Regulations Violations': rule(DISCOVERABILITY.LIMITED, ['construction-site', 'unpermitted-sign'], ['private-property']),
  'Report an Encroachment on City Property': rule(DISCOVERABILITY.PHOTO, ['encroachment-on-city-property'], ['boulevard', 'sidewalk', 'bike-lane']),
  'Missing / Damaged Street or Traffic Signs': rule(DISCOVERABILITY.PHOTO, ['damaged-or-missing-traffic-sign', 'street-name-sign-damaged', 'faded-or-obstructed-sign'], ['traffic-sign', 'street-name-sign', 'regulatory-or-warning-sign', 'roadway', 'intersection'], {
    photoHint: 'Visible missing, damaged, faded, obstructed, or unreadable traffic or street-name sign.',
    suppressionGroup: 'street-traffic-signs',
  }),
  'Catch Basin - Blocked / Flooding': rule(DISCOVERABILITY.PHOTO, ['catch-basin'], ['roadway', 'boulevard', 'surface-watermain-break', 'large-water-flow-on-road']),
  'Long Grass and Prohibited Plants on Private Property': rule(DISCOVERABILITY.PHOTO, ['long-grass-or-prohibited-plants'], ['private-property']),
  'Icy Sidewalk Needs Salting': rule(DISCOVERABILITY.PHOTO, ['icy-sidewalk'], ['sidewalk'], {
    suppressionGroup: 'sidewalk-snow-ice',
  }),
  'Residential or Park Tree Removal': rule(DISCOVERABILITY.LIMITED, ['tree-removal-or-injury'], ['public-tree', 'private-tree', 'city-park'], {
    suppressionGroup: 'tree-removal',
  }),
  'Damaged Concrete Sidewalk': rule(DISCOVERABILITY.PHOTO, ['damaged-concrete-sidewalk'], ['sidewalk', 'tree-roots-trip-hazard'], {
    suppressionGroup: 'sidewalk-surface-defect',
  }),
  'Boulevard Plow Damage': rule(DISCOVERABILITY.PHOTO, ['snow-plow-boulevard-damage'], ['boulevard']),
  'Road - Sinking': rule(DISCOVERABILITY.PHOTO, ['sunken-road-surface'], ['road-sinking-or-sinkhole', 'roadway'], {
    photoHint: 'Sunken or depressed road surface without an open hole.',
    suppressionGroup: 'road-sinking',
  }),
  'Road Salting Request': rule(DISCOVERABILITY.LIMITED, ['icy-road'], ['roadway'], {
    forceConfidenceTier: 'possible',
    suppressionGroup: 'road-winter-maintenance',
  }),
  'Residential / Yard Waste / Missed': rule(DISCOVERABILITY.LIMITED, ['yard-waste'], ['residential-curb'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['residential-curb'],
    suppressionGroup: 'missed-yard-waste',
  }),
  'Water Service Line-Check Water Service Box': rule(DISCOVERABILITY.PHOTO, ['water-service-box-damaged'], ['water-service-box'], {
    photoHint: 'Water service box or cover is visibly damaged, missing, raised, or sunken.',
    suppressionGroup: 'water-service-box',
  }),
  'Watermain-Possible Break': rule(DISCOVERABILITY.PHOTO, ['large-water-flow-on-road'], ['surface-watermain-break', 'roadway', 'boulevard'], {
    photoHint: 'Large volume of water surfacing or flowing on public road, roadside, sidewalk, or boulevard.',
    suppressionGroup: 'water-main-break',
  }),
  'Clean up Litter on Sidewalks and Boulevards': rule(DISCOVERABILITY.PHOTO, ['sidewalk-boulevard-litter', 'laneway-litter'], ['loose-litter', 'sidewalk', 'boulevard', 'laneway']),
  'Clean up Overflowing Street Litter Bin': rule(DISCOVERABILITY.PHOTO, ['overflowing-street-litter-bin'], ['street-litter-bin']),
  'Illegal Snow Dumping & Failure to Clear Snow or Ice on Public Sidewalk': rule(DISCOVERABILITY.LIMITED, ['snow-dumped-on-public-sidewalk'], ['snow-covered-sidewalk', 'icy-sidewalk', 'sidewalk'], {
    photoHint: 'Snow visibly dumped or piled from private property onto a public sidewalk.',
    suppressionGroup: 'sidewalk-snow-ice',
  }),
  'Water Service Line-Leaking': rule(DISCOVERABILITY.LIMITED, ['water-leaking-from-service-box'], ['surface-watermain-break', 'water-service-box'], {
    photoHint: 'Water visibly leaking, bubbling, or pooling from a water service box.',
    suppressionGroup: 'water-service-box',
  }),
  'Dog Off-Leash in a City Park': rule(DISCOVERABILITY.PHOTO, ['dog-off-leash'], ['city-park']),
  'Unauthorized Tree Injury or Removal': rule(DISCOVERABILITY.PHOTO, ['tree-removal-or-injury'], ['public-tree'], {
    suppressionGroup: 'tree-removal',
  }),
  'Postering City Property / Structures': rule(DISCOVERABILITY.PHOTO, ['poster-on-public-asset'], []),
  'Graffiti on Private Property': rule(DISCOVERABILITY.PHOTO, ['graffiti-private-property'], ['private-property']),
  'Residential Bin Wheel Damaged': rule(DISCOVERABILITY.PHOTO, ['bin-wheel-damaged'], ['residential-collection-bin', 'garbage-bin', 'recycling-bin', 'organic-bin']),
  'Residential Organic Bin Whole Street Not Picked Up': rule(DISCOVERABILITY.LIMITED, ['multiple-curbside-setouts'], ['curbside-organics', 'organic-bin'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['curbside-organics'],
    suppressionGroup: 'missed-organics',
  }),
  'Illegal Off-Street Parking': rule(DISCOVERABILITY.PHOTO, ['illegal-off-street-parking'], ['private-property', 'boulevard']),
  'Dangerous Private Tree Investigation': rule(DISCOVERABILITY.LIMITED, ['private-hazardous-tree'], ['private-tree', 'hanging-or-broken-branch', 'fallen-tree-or-large-limb', 'private-property'], {
    photoHint: 'Private tree visibly leaning, split, fallen, or with large hazardous limbs.',
    suppressionGroup: 'tree-hazard',
  }),
  'Laneway Needs Salting': rule(DISCOVERABILITY.PHOTO, ['icy-laneway'], ['laneway']),
  'Boulevards - Damaged Asphalt': rule(DISCOVERABILITY.PHOTO, ['damaged-boulevard-asphalt'], ['boulevard']),
  'Walkway - Damaged or Uneven': rule(DISCOVERABILITY.PHOTO, ['uneven-walkway'], ['sidewalk'], {
    suppressionGroup: 'sidewalk-surface-defect',
  }),
  'Residential Garbage Not Picked Up on the Whole Street': rule(DISCOVERABILITY.LIMITED, ['multiple-curbside-setouts'], ['curbside-garbage', 'garbage-bin'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['curbside-garbage'],
    suppressionGroup: 'missed-garbage',
  }),
  'Snow at Intersections - Impeded Mobility': rule(DISCOVERABILITY.PHOTO, ['snow-blocking-intersection-sightline'], ['intersection'], {
    suppressionGroup: 'intersection-snow-sightline',
  }),
  'Sink Hole': rule(DISCOVERABILITY.PHOTO, ['open-sinkhole'], ['road-sinking-or-sinkhole', 'roadway'], {
    photoHint: 'Open sinkhole or visible collapse, not just a sunken surface.',
    suppressionGroup: 'road-sinking',
  }),
  'Snow Removal - Sightline Problem': rule(DISCOVERABILITY.PHOTO, ['snow-blocking-intersection-sightline'], ['intersection', 'roadway'], {
    suppressionGroup: 'intersection-snow-sightline',
  }),
  'Signs': rule(DISCOVERABILITY.LIMITED, ['unpermitted-sign'], ['private-property']),
  'Bus Stops Snow Clearing Required': rule(DISCOVERABILITY.PHOTO, ['snow-covered-bus-stop'], ['bus-stop']),
  'Stray - Confined': rule(DISCOVERABILITY.PHOTO, ['confined-stray-animal'], []),
  'Maintenance Holes Lid Loose/Missing': rule(DISCOVERABILITY.PHOTO, ['maintenance-hole-lid', 'bike-lane-bollard-or-barrier'], ['roadway', 'sidewalk', 'bike-lane'], {
    photoHint: 'Loose, missing, sunken, or damaged maintenance hole cover or visible bollard/barrier damage.',
  }),
  'Stray - At Large': rule(DISCOVERABILITY.PHOTO, ['stray-dog'], []),
  'School Zone Snow Clearing': rule(DISCOVERABILITY.PHOTO, ['snow-covered-school-zone'], ['school-zone']),
  'Walkway Snow Clearing/Salting Request': rule(DISCOVERABILITY.PHOTO, ['snow-covered-sidewalk', 'icy-sidewalk'], ['sidewalk', 'uneven-walkway'], {
    suppressionGroup: 'sidewalk-snow-ice',
  }),
  'Pick up Dead Domestic Animals': rule(DISCOVERABILITY.PHOTO, ['dead-domestic-animal'], []),
  'Bike Lane Winter Maintenance Required': rule(DISCOVERABILITY.PHOTO, ['snow-covered-bike-lane'], ['bike-lane'], {
    suppressionGroup: 'road-winter-maintenance',
  }),
  'Investigate Regulatory Signs': rule(DISCOVERABILITY.PHOTO, ['regulatory-sign-damaged'], ['traffic-sign', 'regulatory-or-warning-sign'], {
    photoHint: 'Regulatory or warning sign visibly damaged, missing, faded, or unreadable.',
    suppressionGroup: 'street-traffic-signs',
  }),
  'Residential Yard Waste Whole Street Not Picked Up': rule(DISCOVERABILITY.LIMITED, ['multiple-curbside-setouts'], ['yard-waste'], {
    forceConfidenceTier: 'possible',
    requiredAllLabelIds: ['yard-waste'],
    suppressionGroup: 'missed-yard-waste',
  }),
  'Clean up Needles or Syringes': rule(DISCOVERABILITY.PHOTO, ['needles-or-syringes'], ['sidewalk', 'boulevard', 'laneway']),
};

const DEFAULT_RULE = rule(DISCOVERABILITY.NONE, [], []);

function rule(discoverability, requiredAnyLabelIds, supportingLabelIds, config) {
  const options = typeof config === 'string'
    ? { forceConfidenceTier: config }
    : config ?? {};
  const requiredAllLabelIds = options.requiredAllLabelIds ?? [];
  const visualCueLabelIds = unique([
    ...requiredAnyLabelIds,
    ...requiredAllLabelIds,
    ...supportingLabelIds,
  ]);
  return {
    discoverability,
    requiredAnyLabelIds,
    requiredAllLabelIds,
    visualCueLabelIds,
    forceConfidenceTier: options.forceConfidenceTier,
    photoHint: options.photoHint,
    suppressionGroup: options.suppressionGroup,
  };
}

function main() {
  const source = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8'));
  const targets = source.targets ?? [];
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('No targets found in data/toronto-311-target-issues.json.');
  }

  const appIssues = targets.map(toAppIssue);
  const edgeIssues = appIssues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    categoryPath: issue.categoryPath,
    shortDescription: issue.description,
    discoverability: issue.discoverability,
    visualCueLabelIds: issue.visualCueLabelIds,
    requiredAnyLabelIds: issue.requiredAnyLabelIds,
    requiredAllLabelIds: issue.requiredAllLabelIds,
    photoHint: issue.photoHint,
    suppressionGroup: issue.suppressionGroup,
    forceConfidenceTier: issue.forceConfidenceTier,
  }));

  writeTs(APP_CATALOG_TS, buildAppCatalogTs(appIssues));
  writeTs(CATEGORY_TITLE_IDS_TS, buildCategoryTitleIdsTs(appIssues));
  writeTs(EDGE_CATALOG_TS, buildEdgeCatalogTs(edgeIssues));
  writeJson(PHOTO_LABELS_JSON, {
    version: PHOTO_LABEL_TAXONOMY_VERSION,
    labels: PHOTO_LABELS,
  });
  writeJson(EDGE_CATALOG_JSON, {
    version: ISSUE_CATALOG_VERSION,
    issues: edgeIssues,
  });

  console.log(`Generated ${path.relative(ROOT, APP_CATALOG_TS)}`);
  console.log(`Generated ${path.relative(ROOT, CATEGORY_TITLE_IDS_TS)}`);
  console.log(`Generated ${path.relative(ROOT, EDGE_CATALOG_TS)}`);
  console.log(`Generated ${path.relative(ROOT, PHOTO_LABELS_JSON)}`);
  console.log(`Generated ${path.relative(ROOT, EDGE_CATALOG_JSON)}`);
}

function toAppIssue(target) {
  const title = target.targetIssueName;
  const ruleForIssue = ISSUE_RULES[title] ?? DEFAULT_RULE;
  const categoryPath = target.match?.categoryPath?.length
    ? target.match.categoryPath
    : [title];
  const questions = (target.formQuestions ?? [])
    .map(normalizeQuestion)
    .filter(Boolean);

  return {
    id: slugify(title),
    title,
    subjectLabel: title.toLowerCase(),
    categoryPath,
    description: shortDescription(target.reportDescription || target.targetListDescription || ''),
    sourceMatchStatus: target.matchStatus === 'matched' ? 'matched' : target.matchStatus,
    discoverability: ruleForIssue.discoverability,
    visualCueLabelIds: ruleForIssue.visualCueLabelIds,
    requiredAnyLabelIds: ruleForIssue.requiredAnyLabelIds,
    requiredAllLabelIds: ruleForIssue.requiredAllLabelIds,
    photoHint: ruleForIssue.photoHint,
    suppressionGroup: ruleForIssue.suppressionGroup,
    forceConfidenceTier: ruleForIssue.forceConfidenceTier,
    observations: observationsFor(target, ruleForIssue),
    questions,
  };
}

function normalizeQuestion(question) {
  const answerType = normalizeAnswerType(question.answerType);
  if (!answerType) return null;

  return {
    id: question.questionId || slugify(question.questionText),
    label: question.questionText,
    placeholder: placeholderFor(answerType),
    answerType,
    isRequired: Boolean(question.isRequired),
    sectionName: question.sectionName || 'intakeQuestions',
    options: (question.options ?? []).map((option) => ({
      label: option.label,
      value: option.value || option.label,
      isEligibleResponse: option.isEligibleResponse ?? null,
      suggestedLabelIds: suggestedLabelIdsForOption(option.label),
    })),
  };
}

function normalizeAnswerType(answerType) {
  switch (answerType) {
    case 'Picklist':
      return 'picklist';
    case 'Radio':
      return 'radio';
    case 'Multipicklist':
      return 'multipicklist';
    case 'Freeform':
      return 'text';
    case 'Date':
      return 'date';
    case 'Time':
      return 'time';
    case 'Number':
      return 'number';
    default:
      return null;
  }
}

function placeholderFor(answerType) {
  switch (answerType) {
    case 'picklist':
    case 'radio':
      return 'Select one';
    case 'multipicklist':
      return 'Select all that apply';
    case 'date':
      return 'YYYY-MM-DD';
    case 'time':
      return 'Example: 8:30 AM';
    case 'number':
      return 'Enter a number';
    default:
      return 'Enter details';
  }
}

function suggestedLabelIdsForOption(label) {
  const text = label.toLowerCase();
  const suggestions = [];

  addIf(suggestions, text.includes('lid'), 'bin-lid-damaged');
  addIf(suggestions, text.includes('body') || text.includes('handle'), 'bin-body-or-handle-damaged');
  addIf(suggestions, text.includes('wheel'), 'bin-wheel-damaged');
  addIf(suggestions, text.includes('garbage'), 'garbage-bin', 'curbside-garbage');
  addIf(suggestions, text.includes('recycl'), 'recycling-bin', 'curbside-recycling');
  addIf(suggestions, text.includes('organic'), 'organic-bin', 'curbside-organics');
  addIf(suggestions, text.includes('yard waste'), 'yard-waste');
  addIf(suggestions, text.includes('oversized') || text.includes('electronic'), 'oversized-or-electronic-item');
  addIf(suggestions, text.includes('pothole'), 'road-pothole');
  addIf(suggestions, text.includes('road'), 'roadway', 'road-surface-damage');
  addIf(suggestions, text.includes('sidewalk'), 'sidewalk', 'damaged-concrete-sidewalk');
  addIf(suggestions, text.includes('concrete'), 'damaged-concrete-sidewalk');
  addIf(suggestions, text.includes('asphalt'), 'damaged-boulevard-asphalt', 'road-surface-damage');
  addIf(suggestions, text.includes('boulevard'), 'boulevard');
  addIf(suggestions, text.includes('laneway'), 'laneway');
  addIf(suggestions, text.includes('litter'), 'loose-litter');
  addIf(suggestions, text.includes('illegal dumping') || text.includes('dumping'), 'illegal-dumping');
  addIf(suggestions, text.includes('debris'), 'construction-debris', 'loose-litter');
  addIf(suggestions, text.includes('needle') || text.includes('syringe'), 'needles-or-syringes');
  addIf(suggestions, text.includes('human waste'), 'biohazard-human-waste');
  addIf(suggestions, text.includes('snow'), 'snow-covered-road', 'snow-covered-sidewalk');
  addIf(suggestions, text.includes('ice') || text.includes('icy') || text.includes('salting'), 'icy-sidewalk', 'icy-laneway');
  addIf(suggestions, text.includes('tree'), 'public-tree', 'private-tree');
  addIf(suggestions, text.includes('branch') || text.includes('limb'), 'fallen-tree-or-large-limb', 'hanging-or-broken-branch');
  addIf(suggestions, text.includes('sign'), 'traffic-sign', 'street-name-sign', 'regulatory-or-warning-sign');
  addIf(suggestions, text.includes('signal'), 'traffic-signal');
  addIf(suggestions, text.includes('catch basin'), 'catch-basin');
  addIf(suggestions, text.includes('water'), 'surface-watermain-break', 'water-service-box');
  addIf(suggestions, text.includes('dog'), 'stray-dog', 'dog-off-leash');
  addIf(suggestions, text.includes('wildlife'), 'injured-wildlife', 'dead-wildlife');
  addIf(suggestions, text.includes('private property'), 'private-property');

  return unique(suggestions);
}

function addIf(target, condition, ...labelIds) {
  if (condition) target.push(...labelIds);
}

function observationsFor(target, ruleForIssue) {
  if (ruleForIssue.discoverability === DISCOVERABILITY.NONE) {
    return [
      'This issue usually needs user-supplied context beyond what a photo can prove.',
      'Use the checklist to include the details Toronto 311 asks for.',
    ];
  }

  if (ruleForIssue.forceConfidenceTier === 'possible') {
    return [
      'Photo evidence can show the material, but pickup timing still needs user confirmation.',
      'Use the checklist to include schedule and set-out details.',
    ];
  }

  return [
    'Photo evidence can support this issue type.',
    'Use the checklist to include any jurisdiction, timing, or safety details.',
  ];
}

function buildAppCatalogTs(issues) {
  return `${generatedHeader()}
import type { IssueCategory, PhotoLabelDefinition } from '../types';

export const ISSUE_CATALOG_VERSION = ${JSON.stringify(ISSUE_CATALOG_VERSION)};
export const PHOTO_LABEL_TAXONOMY_VERSION = ${JSON.stringify(PHOTO_LABEL_TAXONOMY_VERSION)};

export const PHOTO_LABELS: PhotoLabelDefinition[] = ${json(PHOTO_LABELS)};

const ISSUE_CATALOG_DATA: Omit<IssueCategory, 'emailGuidanceChecklist'>[] = ${json(issues)};

export const ISSUE_CATEGORIES: IssueCategory[] = ISSUE_CATALOG_DATA.map((issue) => ({
  ...issue,
  emailGuidanceChecklist: issue.questions,
}));
`;
}

function buildEdgeCatalogTs(issues) {
  return `${generatedHeader()}
export const EDGE_ISSUE_CATALOG_VERSION = ${JSON.stringify(ISSUE_CATALOG_VERSION)};

export const EDGE_ISSUE_CATALOG = ${json(issues)} as const;

export type EdgeIssueCatalogItem = (typeof EDGE_ISSUE_CATALOG)[number];
`;
}

function buildCategoryTitleIdsTs(issues) {
  const titleIds = Object.fromEntries(issues.map((issue) => [issue.title, issue.id]));
  return `${generatedHeader()}
export const CATEGORY_TITLE_IDS: Record<string, string> = ${json(titleIds)};
`;
}

function generatedHeader() {
  return `// Generated by scripts/generate-ai-issue-catalogs.cjs. Do not edit by hand.\n`;
}

function writeTs(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeJson(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(contents, null, 2)}\n`);
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function shortDescription(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

main();
