export const availableIds = [];
let idsGenerated = 0;

export default function createEventId() {
  if (availableIds.length) {
    return availableIds.pop();
  }
  const eventId = idsGenerated;
  idsGenerated++;
  return eventId;
}

export const freeUpEventId = (id) => {
  availableIds.push(id);
};
