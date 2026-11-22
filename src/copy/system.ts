/**
 * Every string the System says lives here (brief 7.3) so wording can be tuned
 * in one place. Later steps add quest, XP, level-up and report lines.
 */
export const systemCopy = {
  app: {
    name: 'THE SYSTEM',
    shortName: 'SYSTEM',
  },
  nav: {
    status: 'Status',
    quests: 'Quests',
    log: 'Log',
  },
  windows: {
    status: 'STATUS',
    dailyQuest: 'DAILY QUEST',
    oneTimeQuest: 'ONE-TIME QUESTS',
    log: 'DAILY LOG',
    report: 'SYSTEM REPORT',
    access: 'HUNTER ACCESS',
    registration: 'HUNTER REGISTRATION',
    questDesigner: 'QUEST DESIGNER',
    unknownGate: 'UNKNOWN GATE',
  },
  empty: {
    status: 'No hunter record is linked to this session.',
    quests: 'No quests assigned.',
    oneTimeQuests: 'No one-time quests.',
    food: 'Nothing logged today.',
    workouts: 'No workout logged today.',
    report: 'No closed days to report.',
  },
  pending: {
    access: 'Hunter access activates when the authentication module is installed.',
    registration: 'Registration activates with the authentication module.',
    questDesigner: 'The quest designer activates with the quest module.',
  },
  states: {
    loading: 'The System is retrieving your records.',
    offline: 'Connection to the System lost. Showing the last known state.',
  },
  errors: {
    generic: 'The System could not complete that action.',
    load: 'The System could not retrieve your records.',
    notFound: 'This gate does not exist.',
  },
  actions: {
    addQuest: 'Add quest',
    returnToStatus: 'Return to Status',
    acknowledge: 'Acknowledge',
    retry: 'Try again',
    access: 'Hunter access',
  },
  tabs: {
    food: 'Food',
    workout: 'Workout',
  },
} as const;
