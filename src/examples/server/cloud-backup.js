// require modules
const fs = require('fs');
const archiver = require('archiver');
const os = require('os');
const Now = require('performance-now');
const shortid = require('shortid');

function writeArchive({ path: filePath, dirToArchive }) {
  // create a file to stream archive data to.
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', {
    zlib: { level: 4 } // Sets the compression level.
  });

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      // log warning
    } else {
      // throw error
      throw err;
    }
  });

  // good practice to catch this error explicitly
  archive.on('error', function(err) {
    throw err;
  });

  // pipe archive data to the file
  archive.pipe(output);

  // append a file from stream
  // const file1 = __dirname + '/file1.txt';
  // archive.append(fs.createReadStream(file1), { name: 'file1.txt' });

  // append a file from string
  // archive.append('string cheese!', { name: 'file2.txt' });
  //
  // // append a file from buffer
  // const buffer3 = Buffer.from('buff it!');
  // archive.append(buffer3, { name: 'file3.txt' });

  // append a file
  // archive.file('file1.txt', { name: 'file4.txt' });

  // append files from a sub-directory and naming it `new-subdir` within the archive
  // archive.directory('subdir/', 'new-subdir');

  // append files from a sub-directory, putting its contents at the root of archive
  archive.directory(dirToArchive, false);

  // append files from a glob pattern
  // archive.glob('subdir/*.txt');

  // finalize the archive (ie we are done appending files but streams have to finish yet)
  // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
  // archive.finalize();

  // This event is fired when the data source is drained no matter what was the data source.
  // It is not part of this library but rather from the NodeJS Stream API.
  // @see: https://nodejs.org/api/stream.html#stream_event_end
  return new Promise((resolve) => {
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      resolve();
    });
    archive.finalize();
  });
}

const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: 'us-west-1'
});
function awsSync(key, stream) {
  const start = Now();
  const params = {
    Bucket: 'my-personal-projects',
    Key: key,
    Body: stream
  };
  return new Promise((resolve, reject) => {
    s3.upload(params, function(err, data) {
      if (err) reject(err);
      else resolve({ data, took: Now() - start });
    });
  });
}

/*
  Backs up data to aws s3. All file paths are relative to home directory.
 */
module.exports = (key, dir) => {
  if (!dir) {
    throw `'dir' parameter must be provided.`;
  }
  const archiveName = shortid.generate();
  const path = `${os.homedir()}/tmp/archive_${archiveName}.zip`;
  const dirToArchive = `${os.homedir()}${dir}`;
  return writeArchive({ path, dirToArchive }).then(() => {
    return awsSync(key, fs.createReadStream(path));
  });
};
