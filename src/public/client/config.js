const productionApiBaseRoute = `https://todos.lelandkwong.com`;

export const serverApiBaseRoute = localStorage.getItem('env') === 'production'
  ? productionApiBaseRoute
  : `http://${location.hostname}:3000`;

export const setEnv = (env) => {
  localStorage.setItem('env', env);
  console.log(`env set to '${env}'`);
};
