// TODO: add offline support by building up a log of changes to apply to server. Also cache results to web storage.

import React, { Component } from 'react';
import { render } from 'react-dom';
import Socket from '../socket-client';
import { requestAccessToken, scheduleTokenRefresh } from './auth';
import session from './session';

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
    requestAccessToken(loginCode)
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

function startApp() {
  let sockClient;

  class Example extends Component {
    state = {
      message: '',
      output: '',
      notification: null
    }

    componentDidMount() {
      const { token, onLogout } = this.props;
      const socketClientBasePath = `${serverApiBaseRoute}`;
      const io = require('socket.io-client');
      const socket = io(socketClientBasePath, {
        query: { token },
        secure: true,
        // force websocket as default
        transports: ['websocket']
      });
      sockClient = new Socket(socket);
      socket
        .on('connect', this.handleStart)
        .on('disconnect', this.handleDisconnect)
        .on('TokenError', (error) => {
          console.log(error);
          onLogout();
        })
        .on('error', (err) => {
          console.error('error', err);
        })
        .on('reconnect_attempt', this.handleReconnectAttempt)
        .on('reconnect_error', this.handleReconnectError)
        .on('reconnect', this.handleReconnect);
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
      sockClient.subscribe({
        bucket: 'leland.chat',
        key: 'message'
      }, ({ value, error }) => {
        if (value) {
          this.setState({ message: value.message });
        } else if (error) {
          console.log(error);
        }
      });

      let count = 0;
      let items = [];
      sockClient.forEach(
        {
          bucket: '_oplog',
          // limit: 10,
          values: false,
          // lt: 1518908195449
          gt: new Date('2018-02-17T00:00:00.000Z').getTime(),
          lt: new Date('2018-02-18T00:00:00.000Z').getTime()
        },
        (data, i) => {
          if (i === 0) {
            items = [];
          }
          count = i;
          items.push(data);
          // console.log(data);
        },
        () => console.log({ count, lastItem: items.slice(-1)[0] })
      );

      sockClient.get({
        bucket: 'leland.chat',
        key: 'message'
      }).catch(err => console.log(err))
        .then(value => {
          console.log('get', value);
        });

      sockClient.subscribe({
        bucket: '_oplog',
        limit: 1,
        // reverse: true,
        // keys: false,
      }, (data) => {
        console.log(data);
      });

      sockClient.subscribe({
        bucket: '_oplog',
        limit: 1,
        reverse: true,
        keys: false,
      }, (data) => {
        console.log(data.value);
      });
    }

    setMessage(value) {
      sockClient.patch({
        bucket: 'leland.chat',
        key: 'message',
        ops: [
          { op: 'replace', path: '/message', value },
          // { op: 'add', path: '/foo', value: {} },
          // { op: 'add', path: '/foo/list', value: ['bar', 'none', 'ok'] },
          { op: 'remove', path: '/foo/list/0' },
        ]
      }).catch(err => console.error(err));

      this.setState({ message: value });

      // put({
      //   bucket: 'leland.chat',
      //   key: 'message1',
      //   value
      // }).then(() => {
      //   del({ bucket: 'leland.chat', key: 'message1' });
      // });
    }

    handleLogout = () => {
      const token = session.get().accessToken;
      session.end();
      this.setState({ loggedIn: false });
      fetch(`${apiBaseRoute}/logout/${token}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        }
      }).catch(err => console.error(err))
        .then(res => console.log(res));
      sockClient.close();
    }

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
        </div>
      );
    }
  }

  class App extends Component {
    state = {
      loggedIn: session.get().accessToken || false,
      token: session.get().accessToken
    }

    componentDidMount() {
      if (this.state.loggedIn) {
        const { expiresAt } = session.get();
        scheduleTokenRefresh({ expiresAt });
      }
    }

    handleLogin = ({ token }) => {
      this.setState({
        loggedIn: true,
        token
      });
      const { expiresAt } = session.get();
      scheduleTokenRefresh({ expiresAt });
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
          />
        </div>
      );
    }
  }

  render(<App />, $App);
}

startApp();
