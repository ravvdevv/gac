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

// Proxy the config object to allow environment variable overrides
const configWithEnv = {
  get(key) {
    if (key === 'apiKey' && process.env.GAC_API_KEY) {
      return process.env.GAC_API_KEY;
    }
    if (key === 'model' && process.env.GAC_MODEL) {
      return process.env.GAC_MODEL;
    }
    return config.get(key);
  },
  set(key, value) {
    return config.set(key, value);
  },
  delete(key) {
    return config.delete(key);
  },
  get store() {
    const store = { ...config.store };
    if (process.env.GAC_API_KEY) store.apiKey = process.env.GAC_API_KEY;
    if (process.env.GAC_MODEL) store.model = process.env.GAC_MODEL;
    return store;
  }
};

export default configWithEnv;
