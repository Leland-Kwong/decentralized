const productionApiBaseRoute = `https://event-driven-storage-kfbcsfytsm.now.sh`;

export const serverApiBaseRoute = localStorage.getItem('env') === 'staging'
  ? productionApiBaseRoute
  : `http://${location.hostname}:3000`;

export const setEnv = (env) => {
  localStorage.setItem('env', env);
  console.log(`env set to '${env}'`);
};
