import { IssueCategory } from './types';

export const ISSUE_CATEGORIES: IssueCategory[] = [
  {
    id: 'road-damage',
    title: 'Pothole or road damage',
    subjectLabel: 'road damage',
    observations: [
      'Visible road surface damage',
      'Located on or near a vehicle or bike lane',
      'Photo can help crews identify the exact spot',
    ],
    questions: [
      {
        id: 'size',
        label: 'Approximate size',
        placeholder: 'Example: larger than a dinner plate',
      },
      {
        id: 'position',
        label: 'Exact position',
        placeholder: 'Example: curb lane, north side, beside driveway',
      },
      {
        id: 'traffic',
        label: 'Traffic impact',
        placeholder: 'Example: vehicles swerve around it',
      },
    ],
  },
  {
    id: 'illegal-dumping',
    title: 'Illegal dumping',
    subjectLabel: 'illegal dumping',
    observations: [
      'Discarded items are visible',
      'Location appears accessible to city crews',
      'Photo helps identify item type and volume',
    ],
    questions: [
      {
        id: 'items',
        label: 'What was dumped?',
        placeholder: 'Example: mattress, bags, furniture',
      },
      {
        id: 'quantity',
        label: 'Approximate amount',
        placeholder: 'Example: 5 bags and one chair',
      },
      {
        id: 'public-space',
        label: 'Where is it located?',
        placeholder: 'Example: laneway, sidewalk edge, park entrance',
      },
    ],
  },
  {
    id: 'overflowing-bin',
    title: 'Overflowing street bin',
    subjectLabel: 'overflowing street bin',
    observations: [
      'Street bin appears full or overflowing',
      'Waste is visible around the bin',
      'Location details help identify the correct bin',
    ],
    questions: [
      {
        id: 'bin-type',
        label: 'Bin type',
        placeholder: 'Example: garbage, recycling, mixed street bin',
      },
      {
        id: 'spillover',
        label: 'Spillover',
        placeholder: 'Example: garbage is spilling onto sidewalk',
      },
      {
        id: 'landmark',
        label: 'Nearest landmark',
        placeholder: 'Example: outside library entrance',
      },
    ],
  },
  {
    id: 'park-litter',
    title: 'Park or ravine litter',
    subjectLabel: 'park or ravine litter',
    observations: [
      'Litter or debris appears in a park/ravine area',
      'Location note is important for crews',
      'Photo can show volume and type of debris',
    ],
    questions: [
      {
        id: 'area',
        label: 'Park area',
        placeholder: 'Example: beside trail, playground, picnic area',
      },
      {
        id: 'debris',
        label: 'Type of litter',
        placeholder: 'Example: bottles, bags, construction debris',
      },
      {
        id: 'access',
        label: 'Access note',
        placeholder: 'Example: 20 metres east of the entrance',
      },
    ],
  },
  {
    id: 'graffiti',
    title: 'Graffiti on public asset',
    subjectLabel: 'graffiti on a public asset',
    observations: [
      'Graffiti is visible on a public-facing object',
      'Asset type and exact location are important',
      'Photo helps identify the surface and markings',
    ],
    questions: [
      {
        id: 'asset',
        label: 'Asset type',
        placeholder: 'Example: sign, bench, utility box',
      },
      {
        id: 'surface',
        label: 'Surface/material',
        placeholder: 'Example: painted metal, concrete, glass',
      },
      {
        id: 'visibility',
        label: 'Visibility/location',
        placeholder: 'Example: visible from sidewalk',
      },
    ],
  },
];

export function getCategory(categoryId: string) {
  return ISSUE_CATEGORIES.find((category) => category.id === categoryId) ?? ISSUE_CATEGORIES[0];
}

export function findCategoryByTitle(title: string) {
  return ISSUE_CATEGORIES.find((category) => category.title === title);
}

export function getCategoryByTitle(title: string) {
  return findCategoryByTitle(title) ?? ISSUE_CATEGORIES[0];
}
