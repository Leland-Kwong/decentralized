export const availableIds = [];
let idsGenerated = 0;

export default function createEventId(namespace, verbose = false) {
  if (availableIds.length) {
    return availableIds.pop();
  }
  let prefix = '';
  if (verbose) {
    prefix = namespace ? namespace + '/' : '';
  }
  const eventId = prefix + idsGenerated;
  idsGenerated++;
  return eventId;
}

export const freeUpEventId = (id) => {
  availableIds.push(id);
};
