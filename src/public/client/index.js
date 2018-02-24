// TODO: add offline support by building up a log of changes to apply to server. Also cache responses to web storage.

import React, { Component } from 'react';
import { render } from 'react-dom';
import Socket from '../socket-client';
import * as auth from './auth';
import session from './session';
import Input from '../../examples/Input';
import debounce from 'lodash.debounce';

const $App = document.querySelector('#App');
const { serverApiBaseRoute } = require('./config');
const apiBaseRoute = `${serverApiBaseRoute}/api`;
class LoginForm extends Component {
  static defaultProps = {
    onAuthorized: () => {}
  }

  state = {
    loginCode: '',
    email: '',
    loginRequested: false
  }

  componentDidMount() {
    const token = session.get().accessToken;
    if (token) {
      return this.props.onAuthorized({ token });
    }
  }

  handleSubmit = (e) => {
    e.preventDefault();
    const { loginCode } = this.state;
    auth.requestAccessToken(loginCode)
      .catch(err => console.error(err))
      .then(res => this.props.onAuthorized({ token: res.accessToken }));
  }

  handleLoginRequest = (e) => {
    e.preventDefault();
    this.setState({ loginRequested: true });
    fetch(`${apiBaseRoute}/login`, {
      method: 'post',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        email: this.state.email
      })
    }).catch(err => {
      console.error(err);
    }).then(res => res.json())
      .then(res => console.log(res));
  }

  setLoginCode = (e) => {
    this.setState({ loginCode: e.target.value });
  }

  setEmail = (e) => {
    this.setState({ email: e.target.value });
  }

  render() {
    if (!this.state.loginRequested) {
      return (
        <form onSubmit={this.handleLoginRequest}>
          <label htmlFor="name" className="f6 b db mb2">Sign-in with email: <span className="normal black-60">(required)</span></label>
          <input
            type='email'
            autoComplete={'email'}
            value={this.state.email}
            onChange={this.setEmail}
            className='input-reset ba b--black-20 pa2 mb2 db w-100'
          />
          <button>login</button>
        </form>
      );
    }
    return (
      <div>
        <div><strong>Email sent to {this.state.email}</strong></div>
        <form onSubmit={this.handleSubmit}>
          <label htmlFor="name" className="f6 b db mb2">Login code: <span className="normal black-60">(required)</span></label>
          <input
            value={this.state.loginCode}
            onChange={this.setLoginCode}
            className='input-reset ba b--black-20 pa2 mb2 db w-100'
          />
        </form>
      </div>
    );
  }
}

function checkOpLog(db) {
  db.bucket('_opLog')
    .inspect({}, res => {
      console.log('[OPLOG]', res, Object.keys(res.value).length);
    });
  db.bucket('_sessions')
    .inspect(res => {
      console.log('[SESSIONS]', res);
    });
}

function startApp() {
  let sockClient;

  class Example extends Component {
    state = {
      message: '',
      output: '',
      items: [],
      notification: null,
      started: false
    }

    componentDidMount() {
      const { token } = this.props;
      sockClient = new Socket({ token, enableOffline: true });
      const clientNoOffline = new Socket({ token });
      checkOpLog(clientNoOffline);
      const testBucket = clientNoOffline.bucket('leland.list');
      console.log(
        testBucket,
        testBucket.key('blah'),
        testBucket.key('blah2'),
      );

      sockClient.socket
        .on('connect', this.handleStart)
        .on('disconnect', this.handleDisconnect)
        .on('TokenError', (error) => {
          console.log(error);
          this.handleLogout();
        })
        .on('error', (err) => {
          console.error('error', err);
        })
        .on('reconnect_attempt', this.handleReconnectAttempt)
        .on('reconnect_error', this.handleReconnectError)
        .on('reconnect', this.handleReconnect);

      if (process.env.NODE_ENV === 'stressTest') {
        const stressTest = () => {
          new Array(300).fill(0).forEach(this.handleStart);
          setTimeout(() => {
            location.reload();
          }, 1000);
        };
        sockClient.socket.on('connect', stressTest);
      }
    }

    notify = ({ title, message }) => {
      this.setState({
        notification: {
          title,
          message
        }
      });
    }

    handleReconnectAttempt = (attemptNumber) => {
      this.handleStart();
      this.notify({
        title: 'reconnect attempt',
        message: `reconnecting... (attempt ${attemptNumber})`
      });
    }

    handleReconnect = () => {
      this.setState({ notification: null });
    }

    handleReconnectError = (error) => {
      console.error(error);
      this.notify({
        title: 'reconnect error',
        message: error.message
      });
    }

    handleDisconnect = () => {
      this.notify({
        title: 'connection error',
        message: 'disconnected'
      });
    }

    handleStart = () => {
      if (this.state.started) {
        return;
      }
      this.setState({ started: true });

      sockClient.subscribe({
        bucket: 'leland.chat'
      }, (data) => {
        console.log('leland.chat', data);
      });

      let items;
      sockClient.subscribe({
        bucket: 'leland.list',
        limit: 3,
        reverse: true
      }, (data) => {
        items = items || {};
        items[data.key] = data.value;
      }, () => {
        if (!items) {
          return;
        }
        this.setState({ items });
        items = null;
      });
    }

    setMessage(value) {
      this.setState({ message: value });
      this.setMessageUpdateServer(value);
    }

    setMessageUpdateServer = debounce(function update(value) {
      sockClient.put({
        bucket: 'leland.chat',
        key: 'json_message',
        value: { value }
      });

      sockClient.patch({
        bucket: 'leland.chat',
        key: 'message',
        ops: [
          { op: 'add', path: '/message', value },
          { op: 'add', path: '/nested', value: {} },
          { op: 'add', path: '/nested/value', value },
          { op: 'add', path: '/foo', value: { list: ['bar', 'none', 'ok'] } },
          // { op: 'add', path: '/foo/list/3', value: 'blah' },
          // { op: 'move', from: '/foo/list/1', path: '/foo/list/0' }
          // { op: 'replace', path: '/foo/list', value: ['bar', 'none', 'ok'] },
        ]
      }).catch(err => {
        console.error(err);
        sockClient.put({
          bucket: 'leland.chat',
          key: 'message',
          value: {}
        }).catch(error => console.error(error))
          .then(() => {
            update(value);
          });
      });
    }, 500)

    handleLogout = () => {
      auth.logout().catch(err => console.error(err))
        .then(res => console.log(res));
      sockClient.close();
      this.props.onLogout();
    }

    addItem = (e) => {
      e && e.preventDefault();
      const value = this.state.message;
      if (!value) {
        return;
      }
      const key = Date.now();
      const items = {
        ...this.state.items,
        [key]: value
      };
      this.setState({ message: '' });
      this.setState({ items });
      sockClient.put({
        bucket: 'leland.list',
        key,
        value
      });
    }

    removeItem = (key) => {
      const items = { ...this.state.items };
      delete items[key];
      sockClient.del({
        bucket: 'leland.list',
        key
      }).then(() => this.setState({ items }));
    }

    updateItem = (key, value) => {
      const { items } = this.state;
      items[key] = value;
      this.setState({ items });
      this.updateItemServer(key, value);
    }

    updateItemServer = debounce((key, value) => {
      return sockClient.put({
        bucket: 'leland.list',
        key,
        value
      });
    }, 500)

    render() {
      return (
        <div>
          {this.state.notification
            && (
              <div>
                <pre><code>{
                  JSON.stringify(this.state.notification, null, 4)
                }</code></pre>
              </div>
            )
          }
          <section>
            <button onClick={this.handleLogout}>
              logout
            </button>
          </section>
          <section>
            <form onSubmit={this.addItem}>
              <label htmlFor="name" className="f6 b db mb2">Name <span className="normal black-60">(optional)</span></label>
              <Input
                placeholder="Enter a message..."
                autoFocus
                onInput={(e) => this.setMessage(e.target.value)}
                value={this.state.message}
              />
            </form>
            {/* List - testing iteration of a bucket */}
            <ul>
              {Object.keys(this.state.items).sort().map((key) => {
                const v = this.state.items[key];
                return (
                  <li
                    key={key}
                    className='bt b--dark-gray pa2'
                  >
                    <div>
                      <Input
                        type='textarea'
                        onChange={e => this.updateItem(key, e.target.value)}
                        value={v}
                      />
                    </div>
                    <div>key: {key}</div>
                    <button
                      onClick={() => this.removeItem(key)}
                    >delete</button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      );
    }
  }

  class App extends Component {
    state = {
      loggedIn: session.get().accessToken || false,
      token: session.get().accessToken,
      sessionInfo: session.get()
    }

    componentDidMount() {
      if (this.state.loggedIn) {
        const { expiresAt } = session.get();
        auth.scheduleTokenRefresh({
          expiresAt,
        }, this.updateSessionInfo);
      }
    }

    handleLogin = ({ token }) => {
      this.setState({
        loggedIn: true,
        token
      });
      const { expiresAt } = session.get();
      auth.scheduleTokenRefresh({ expiresAt }, this.updateSessionInfo);
    }

    handleLogout = () => {
      this.setState({ loggedIn: false });
    }

    updateSessionInfo = (session) => {
      this.setState({
        sessionInfo: session
      });
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
          <Example
            token={this.state.token}
            onLogout={this.handleLogout}
          />
          <pre><code>
            {JSON.stringify(this.state.sessionInfo, null, 2)}
          </code></pre>
        </div>
      );
    }
  }

  render(<App />, $App);
}

startApp();
