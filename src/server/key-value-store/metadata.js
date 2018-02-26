const path = require('path');
const fs = require('fs-extra');
const LexId = require('../../isomorphic/lexicographic-id');

const dbId = LexId();
module.exports = async function getMetadata(rootDir) {
  const filePath = path.join(rootDir, 'metadata.json');
  try {
    const metadataFromFile = await fs.readFile(filePath);
    if (metadataFromFile) {
      return JSON.parse(metadataFromFile);
    }
  } catch(err) {
    const metadata = {
      id: dbId()
    };
    const content = JSON.stringify(metadata);
    await fs.writeFile(filePath, content);
    return metadata;
  }
};
