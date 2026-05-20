import { PHOTO_LABELS } from './photoLabels';
import { PhotoIssueTopic, PhotoIssueTopicSelection, PhotoVisionResult } from './types';

const MAX_SUGGESTED_TOPICS = 3;

export const PHOTO_ISSUE_TOPICS: PhotoIssueTopic[] = [
  {
    id: 'topic-pothole',
    labelId: 'pothole',
    title: 'Report a pothole',
    subjectTitle: 'pothole repair',
    subjectLabel: 'pothole',
    descriptionPlaceholder: 'Example: pothole in the curb lane near the crosswalk',
    questions: ['How large is it?', 'Which lane or curb area is it in?', 'Is traffic swerving or slowing?'],
  },
  {
    id: 'topic-damaged-road',
    labelId: 'damaged-road',
    title: 'Report damaged road surface',
    subjectTitle: 'road surface repair',
    subjectLabel: 'damaged road surface',
    descriptionPlaceholder: 'Example: cracked and uneven road surface beside the bus stop',
    questions: ['What kind of road damage is visible?', 'Where is the worst spot?', 'Does it affect drivers, cyclists, or pedestrians?'],
  },
  {
    id: 'topic-damaged-sidewalk',
    labelId: 'damaged-sidewalk',
    title: 'Report sidewalk damage',
    subjectTitle: 'sidewalk repair',
    subjectLabel: 'damaged sidewalk',
    descriptionPlaceholder: 'Example: raised sidewalk slab near the building entrance',
    questions: ['Is it cracked, raised, sunken, or broken?', 'Could someone trip over it?', 'What landmark helps crews find it?'],
  },
  {
    id: 'topic-blocked-sidewalk',
    labelId: 'blocked-sidewalk',
    title: 'Report a blocked sidewalk',
    subjectTitle: 'blocked sidewalk',
    subjectLabel: 'blocked sidewalk',
    descriptionPlaceholder: 'Example: sidewalk blocked by debris beside the park gate',
    questions: ['What is blocking the sidewalk?', 'Can pedestrians pass safely?', 'Is the blockage temporary or unattended?'],
  },
  {
    id: 'topic-overflowing-bin',
    labelId: 'overflowing-bin',
    title: 'Report an overflowing bin',
    subjectTitle: 'overflowing street bin',
    subjectLabel: 'overflowing street bin',
    descriptionPlaceholder: 'Example: overflowing street bin with litter spilling onto the sidewalk',
    questions: ['What type of bin is it?', 'Is waste spilling around it?', 'What nearby landmark identifies the bin?'],
  },
  {
    id: 'topic-loose-litter',
    labelId: 'loose-litter',
    title: 'Report loose litter',
    subjectTitle: 'loose litter cleanup',
    subjectLabel: 'loose litter',
    descriptionPlaceholder: 'Example: loose litter scattered along the sidewalk beside the plaza',
    questions: ['What kind of litter is visible?', 'How spread out is it?', 'Is it near a park, sidewalk, or road?'],
  },
  {
    id: 'topic-garbage-bags',
    labelId: 'garbage-bags',
    title: 'Report garbage bags',
    subjectTitle: 'garbage bags pickup',
    subjectLabel: 'garbage bags left in public space',
    descriptionPlaceholder: 'Example: several garbage bags left beside the laneway entrance',
    questions: ['How many bags are there?', 'Are they blocking access?', 'Are they on public property?'],
  },
  {
    id: 'topic-furniture',
    labelId: 'furniture',
    title: 'Report discarded furniture',
    subjectTitle: 'discarded furniture pickup',
    subjectLabel: 'discarded furniture',
    descriptionPlaceholder: 'Example: discarded chair and table beside the curb',
    questions: ['What furniture items are present?', 'How much space do they take up?', 'Are they blocking sidewalk or road access?'],
  },
  {
    id: 'topic-mattress',
    labelId: 'mattress',
    title: 'Report a discarded mattress',
    subjectTitle: 'discarded mattress pickup',
    subjectLabel: 'discarded mattress',
    descriptionPlaceholder: 'Example: mattress left beside the apartment driveway',
    questions: ['Is it a mattress, box spring, or both?', 'Is it on the sidewalk, curb, or laneway?', 'Is it blocking anyone?'],
  },
  {
    id: 'topic-construction-debris',
    labelId: 'construction-debris',
    title: 'Report construction debris',
    subjectTitle: 'construction debris cleanup',
    subjectLabel: 'construction debris',
    descriptionPlaceholder: 'Example: wood and drywall debris left near the curb',
    questions: ['What material is visible?', 'How much debris is there?', 'Is it sharp, heavy, or blocking access?'],
  },
  {
    id: 'topic-graffiti',
    labelId: 'graffiti',
    title: 'Report graffiti',
    subjectTitle: 'graffiti removal',
    subjectLabel: 'graffiti',
    descriptionPlaceholder: 'Example: graffiti on the utility box facing the sidewalk',
    questions: ['What surface is marked?', 'How large is the graffiti?', 'Is it on a public-facing asset?'],
  },
  {
    id: 'topic-damaged-sign',
    labelId: 'damaged-sign',
    title: 'Report a damaged sign',
    subjectTitle: 'damaged sign repair',
    subjectLabel: 'damaged sign',
    descriptionPlaceholder: 'Example: bent stop sign at the northwest corner',
    questions: ['What kind of sign is damaged?', 'Is it bent, missing, blocked, or vandalized?', 'Does it affect traffic or pedestrian safety?'],
  },
  {
    id: 'topic-damaged-bench',
    labelId: 'damaged-bench',
    title: 'Report a damaged bench',
    subjectTitle: 'damaged bench repair',
    subjectLabel: 'damaged public bench',
    descriptionPlaceholder: 'Example: broken bench seat beside the transit stop',
    questions: ['What part of the bench is damaged?', 'Can people still use it safely?', 'What landmark identifies the bench?'],
  },
  {
    id: 'topic-utility-box',
    labelId: 'utility-box',
    title: 'Report a utility box issue',
    subjectTitle: 'utility box issue',
    subjectLabel: 'utility box issue',
    descriptionPlaceholder: 'Example: damaged utility box beside the sidewalk',
    questions: ['What appears wrong with the box?', 'Is it open, damaged, tagged, or blocking access?', 'What is the nearest address or landmark?'],
  },
  {
    id: 'topic-streetlight',
    labelId: 'streetlight',
    title: 'Report a streetlight issue',
    subjectTitle: 'streetlight issue',
    subjectLabel: 'streetlight issue',
    descriptionPlaceholder: 'Example: streetlight pole damaged near the corner',
    questions: ['What appears wrong with the streetlight?', 'Is the pole, lamp, or wiring affected?', 'Which side of the street is it on?'],
  },
  {
    id: 'topic-catch-basin',
    labelId: 'catch-basin',
    title: 'Report a catch basin issue',
    subjectTitle: 'catch basin issue',
    subjectLabel: 'catch basin issue',
    descriptionPlaceholder: 'Example: catch basin blocked by leaves near the curb',
    questions: ['Is the grate blocked, damaged, or sunken?', 'Is water pooling nearby?', 'Which curb or corner is it closest to?'],
  },
  {
    id: 'topic-fallen-branch',
    labelId: 'fallen-branch',
    title: 'Report a fallen branch',
    subjectTitle: 'fallen branch removal',
    subjectLabel: 'fallen branch',
    descriptionPlaceholder: 'Example: large fallen branch blocking part of the sidewalk',
    questions: ['How large is the branch?', 'Is it blocking sidewalk, road, or park access?', 'Is it still attached to the tree?'],
  },
  {
    id: 'topic-damaged-tree',
    labelId: 'damaged-tree',
    title: 'Report a damaged tree',
    subjectTitle: 'damaged tree inspection',
    subjectLabel: 'damaged public tree',
    descriptionPlaceholder: 'Example: damaged tree limb hanging over the sidewalk',
    questions: ['What part of the tree is damaged?', 'Is it leaning, split, or broken?', 'Is there an immediate access or safety concern?'],
  },
  {
    id: 'topic-abandoned-bike',
    labelId: 'abandoned-bike',
    title: 'Report an abandoned bike',
    subjectTitle: 'abandoned bike removal',
    subjectLabel: 'abandoned bicycle',
    descriptionPlaceholder: 'Example: stripped bike locked to a signpost for several days',
    questions: ['Where is the bike attached or located?', 'Does it appear stripped or abandoned?', 'Is it blocking pedestrian access?'],
  },
  {
    id: 'topic-needle-sharp',
    labelId: 'needle-sharp',
    title: 'Report a needle or sharp object',
    subjectTitle: 'needle or sharp object cleanup',
    subjectLabel: 'needle or sharp object',
    descriptionPlaceholder: 'Example: visible needle near the park bench',
    questions: ['What sharp object is visible?', 'Is it in a public walking area?', 'Can crews find it from a nearby landmark?'],
  },
];

const TOPICS_BY_LABEL_ID = new Map(PHOTO_ISSUE_TOPICS.map((topic) => [topic.labelId, topic]));

export function getSuggestedIssueTopics(result: PhotoVisionResult | null) {
  if (!result) return [];

  const seen = new Set<string>();
  return result.suggestedLabels
    .map((label): PhotoIssueTopicSelection | null => {
      const topic = TOPICS_BY_LABEL_ID.get(label.id);
      if (!topic || seen.has(topic.id)) return null;
      seen.add(topic.id);
      return {
        ...topic,
        confidence: label.confidence,
        evidence: label.evidence,
      };
    })
    .filter((topic): topic is PhotoIssueTopicSelection => topic != null)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_SUGGESTED_TOPICS);
}

export function getPhotoIssueTopic(topicId: string) {
  return PHOTO_ISSUE_TOPICS.find((topic) => topic.id === topicId) ?? null;
}

export function getMissingPhotoTopicLabelIds() {
  const covered = new Set(PHOTO_ISSUE_TOPICS.map((topic) => topic.labelId));
  return PHOTO_LABELS.map((label) => label.id).filter((labelId) => !covered.has(labelId));
}
