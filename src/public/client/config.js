const productionApiBaseRoute = `https://event-driven-storage-fzhiuudfue.now.sh`;
export const serverApiBaseRoute = process.env.NODE_ENV === 'staging'
  ? productionApiBaseRoute
  : `http://${location.hostname}:3000`;
