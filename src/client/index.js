// TODO: add offline support by building up a log of changes to apply to server. Also cache results to web storage.

import React, { Component } from 'react';
import { render } from 'react-dom';

const $App = document.querySelector('#App');
const { serverApiBaseRoute } = require('./config');
const apiBaseRoute = `${serverApiBaseRoute}/api`;
class LoginForm extends Component {
  static defaultProps = {
    onAuthorized: () => {}
  }

  state = {
    loginCode: ''
  }

  componentDidMount() {
    const token = localStorage.getItem('evds.token');
    if (token) {
      return this.props.onAuthorized({ token });
    }
    fetch(`${apiBaseRoute}/login`, {
      method: 'post',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        email: 'leland.kwong@gmail.com'
      })
    }).catch(err => {
      console.error(err);
    }).then(res => res.json())
      .then(res => console.log(res));
  }

  handleSubmit = (e) => {
    e.preventDefault();
    const { loginCode } = this.state;
    fetch(`${apiBaseRoute}/access-token/${loginCode}`)
      .catch(err => console.error(err))
      .then(res => res.json())
      .then(res => this.props.onAuthorized({ token: res.accessToken }));
  }

  setLoginCode = (e) => {
    this.setState({ loginCode: e.target.value });
  }

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <label htmlFor="name" className="f6 b db mb2">Login code: <span className="normal black-60">(required)</span></label>
        <input
          value={this.state.loginCode}
          onChange={this.setLoginCode}
          className='input-reset ba b--black-20 pa2 mb2 db w-100'
        />
      </form>
    );
  }
}

function startApp() {
  let socket;

  function promisifySocket() {
    let callback;
    const promise = new Promise(function (resolve, reject) {
      callback = function callback({ ok, error, value }) {
        if (!ok) reject(error);
        else resolve(value);
      };
    });
    callback.promise = promise;
    return callback;
  }

  function forEach(params, cb) {
    const {
      bucket,
      limit,
      reverse,
      // TODO: add support for `range` option to limit response to range of keys
    } = params;
    socket.on(bucket, cb);
    socket.emit('forEach', { bucket, limit, reverse });
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

  function put({ bucket, key, value }, cb) {
    const callback = cb || promisifySocket();
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  }

  // gets the value once then removes the socket listener
  function get(params, cb) {
    const callback = cb || promisifySocket();
    socket.emit('get', params, callback);
    return callback.promise;
  }

  function del(params, cb) {
    const { bucket, key } = params;
    const callback = cb || promisifySocket();
    socket.emit('delete', { bucket, key }, callback);
    return callback.promise;
  }

  class Example extends Component {
    state = {
      message: '',
      output: '',
    }

    componentDidMount() {
      const { token, onLogout } = this.props;
      const socketClientBasePath = `${serverApiBaseRoute}`;
      const io = require('socket.io-client');
      socket = io(socketClientBasePath, {
        query: { token },
        secure: true
      });
      socket
        .on('connect', () => {
          this.handleStart();
        })
        .on('disconnect', () => {
          console.log('connection closed');
        })
        .on('TokenError', (error) => {
          console.log(error);
          onLogout();
        })
        .on('error', (err) => {
          console.error('error', err);
        });
    }

    handleStart() {
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

      subscribe({ bucket: '_log', limit: 5, reverse: true }, (data) => {
        console.log(data.value);
      });
    }

    setMessage(value) {
      put({
        bucket: 'leland.chat',
        key: 'message',
        value: { message: value }
      });

      this.setState({ message: value });

      put({
        bucket: 'leland.chat',
        key: 'message1',
        value
      }).then(() => {
        del({ bucket: 'leland.chat', key: 'message1' });
      });
    }

    render() {
      return (
        <div>
          <strong>{this.props.token}</strong>
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

  class App extends Component {
    state = {
      loggedIn: localStorage.getItem('evds.token') || false,
      token: localStorage.getItem('evds.token')
    }

    handleLogin = ({ token }) => {
      localStorage.setItem('evds.token', token);
      this.setState({
        loggedIn: true,
        token
      });
    }

    handleLogout = () => {
      const token = localStorage.getItem('evds.token');
      localStorage.removeItem('evds.token');
      this.setState({ loggedIn: false });
      fetch(`${apiBaseRoute}/logout/${token}`, {
        method: 'post',
        headers: {
          'content-type': 'application/json'
        }
      }).catch(err => console.error(err))
        .then(res => console.log(res));
    }

    render() {
      if (!this.state.loggedIn) {
        return (
          <section>
            <LoginForm onAuthorized={this.handleLogin} />
          </section>
        );
      }
      return (
        <div>
          <button onClick={this.handleLogout}>
            logout
          </button>
          <Example
            token={this.state.token}
            onLogout={this.handleLogout}
          />
        </div>
      );
    }
  }

  render(<App />, $App);
}

startApp();
