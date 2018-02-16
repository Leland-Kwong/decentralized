import React, { Component } from 'react';
import { render } from 'react-dom';

const getScript = (path) => {
  const scriptLoaded = document.querySelector(`[src="${path}"]`);
  if (scriptLoaded) {
    return Promise.resolve(true);
  }
  const script = document.createElement('script');
  script.src = path;
  const promise = new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  document.body.appendChild(script);
  return promise;
};

function startApp({ socket }) {

  function forEach(params, cb) {
    const { bucket } = params;
    socket.on(bucket, cb);
    socket.emit('forEach', { bucket });
  }

  function subscribe(params, subscriber) {
    const { bucket, key } = params;
    if (typeof key === 'undefined') {
      return forEach(params, subscriber);
    }
    const subKey = `${bucket}/${key}`;
    socket.on(subKey, subscriber);
    socket.emit('sub', {
      bucket,
      key
    });
    return () => socket.off(subKey, subscriber);
  }

  function put({ bucket, key, value }) {
    socket.emit('put', { bucket, key, value });
  }

  // gets the value once then removes the socket listener
  function get(params) {
    return new Promise((resolve, reject) => {
      const { bucket, key } = params;
      const subKey = `${bucket}/${key}`;
      const callback = ({ ok, value, error }) => {
        if (!ok) {
          return reject(error);
        }
        resolve(value);
        socket.off(subKey, callback);
      };
      socket.on(subKey, callback);
      socket.emit('get', params);
    });
  }

  function del(params) {
    return new Promise((resolve, reject) => {
      const { bucket, key } = params;
      const subKey = `${bucket}/${key}`;
      const callback = ({ ok, error }) => {
        if (!ok) {
          return reject(error);
        }
        resolve();
        socket.off(subKey, callback);
      };
      socket.on(subKey, callback);
      socket.emit('delete', { bucket, key });
    });
  }

  const $App = document.querySelector('#App');
  class App extends Component {
    state = {
      message: '',
      output: ''
    }

    componentDidMount() {
      subscribe({
        bucket: 'leland.chat',
        key: 'message'
      }, ({ ok, value, error }) => {
        if (ok && value) {
          this.setState({ message: value.message });
        } else if (!ok) {
          console.log(error);
        }
      });

      get({
        bucket: 'leland.chat',
        key: 'message'
      }).catch(err => console.log(err))
        .then(value => {
          console.log('get', value);
        });

      subscribe({ bucket: '_log' }, (data) => {
        console.log(data);
      });
    }

    setMessage(value) {
      put({
        bucket: 'leland.chat',
        key: 'message',
        value: { message: value }
      });
      this.setState({ message: value });
    }

    render() {
      return (
        <div>
          <section>
            <div>
              <label htmlFor="name" className="f6 b db mb2">Name <span className="normal black-60">(optional)</span></label>
              <input
                type="text"
                id="Input"
                className="input-reset ba b--black-20 pa2 mb2 db w-100"
                placeholder="Enter a message..."
                autoFocus
                onInput={(e) => this.setMessage(e.target.value)}
                value={this.state.message}
              />
            </div>
          </section>
          <section>
            server time: <strong>{this.state.ticker}</strong>
          </section>
        </div>
      );
    }
  }

  render(<App />, $App);
}

const socketClientBasePath = `${location.protocol}//${location.hostname}:3001`;
getScript(socketClientBasePath + '/socket.io/socket.io.js')
  .catch(err => console.error(err))
  /* global io */
  .then(() => {
    const socket = io.connect(socketClientBasePath);
    startApp({ socket });
  });
