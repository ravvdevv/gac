import Conf from 'conf';

const schema = {
  apiKey: {
    type: 'string',
    default: '',
  },
  model: {
    type: 'string',
    default: 'openrouter/free',
  },
  systemPrompt: {
    type: 'string',
    default: '',
  },
  style: {
    type: 'string',
    default: 'conventional',
  },
};

const config = new Conf({
  projectName: 'gac',
  projectPrefix: '',
  schema,
  cwd: undefined, // Defaults to standard OS config dir
});

export default config;
