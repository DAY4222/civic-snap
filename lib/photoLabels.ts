export const PHOTO_LABEL_TAXONOMY_VERSION = 'photo-label-taxonomy-v1';

export type PhotoLabelDefinition = {
  id: string;
  label: string;
  description: string;
};

export const PHOTO_LABELS: PhotoLabelDefinition[] = [
  {
    id: 'pothole',
    label: 'Pothole',
    description: 'A visible hole or depression in the road surface.',
  },
  {
    id: 'damaged-road',
    label: 'Damaged road',
    description: 'Cracked, broken, sunken, or uneven road pavement.',
  },
  {
    id: 'damaged-sidewalk',
    label: 'Damaged sidewalk',
    description: 'Broken, lifted, cracked, or uneven sidewalk surface.',
  },
  {
    id: 'blocked-sidewalk',
    label: 'Blocked sidewalk',
    description: 'Objects or debris blocking pedestrian access.',
  },
  {
    id: 'overflowing-bin',
    label: 'Overflowing bin',
    description: 'A public garbage, recycling, or street bin that is full or spilling over.',
  },
  {
    id: 'loose-litter',
    label: 'Loose litter',
    description: 'Scattered garbage, bottles, papers, or small debris.',
  },
  {
    id: 'garbage-bags',
    label: 'Garbage bags',
    description: 'One or more garbage bags left in a public space.',
  },
  {
    id: 'furniture',
    label: 'Furniture',
    description: 'Discarded chairs, couches, tables, dressers, or similar furniture.',
  },
  {
    id: 'mattress',
    label: 'Mattress',
    description: 'A mattress or box spring left outside.',
  },
  {
    id: 'construction-debris',
    label: 'Construction debris',
    description: 'Wood, drywall, concrete, tiles, pipes, or renovation material.',
  },
  {
    id: 'graffiti',
    label: 'Graffiti',
    description: 'Paint, marker, stickers, or tags on a public-facing surface.',
  },
  {
    id: 'damaged-sign',
    label: 'Damaged sign',
    description: 'Broken, bent, missing, or vandalized traffic or public sign.',
  },
  {
    id: 'damaged-bench',
    label: 'Damaged bench',
    description: 'Broken or vandalized public seating.',
  },
  {
    id: 'utility-box',
    label: 'Utility box',
    description: 'A public utility, telecom, traffic, or electrical box.',
  },
  {
    id: 'streetlight',
    label: 'Streetlight',
    description: 'A streetlight pole, lamp, or related fixture.',
  },
  {
    id: 'catch-basin',
    label: 'Catch basin',
    description: 'A storm drain, sewer grate, or catch basin.',
  },
  {
    id: 'fallen-branch',
    label: 'Fallen branch',
    description: 'A fallen tree limb or branch in public space.',
  },
  {
    id: 'damaged-tree',
    label: 'Damaged tree',
    description: 'A visibly damaged, leaning, split, or broken public tree.',
  },
  {
    id: 'abandoned-bike',
    label: 'Abandoned bike',
    description: 'A bicycle that appears abandoned, stripped, or blocking access.',
  },
  {
    id: 'needle-sharp',
    label: 'Needle or sharp',
    description: 'A visible needle, syringe, broken glass, or sharp object.',
  },
];
