// TODO: add offline support by building up a log of changes to apply to server. Also cache responses to web storage.

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
      const { token } = this.props;
      sockClient = new Socket({ token, enableOffline: true });
      sockClient.socket
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
      this.handleStart();
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
        key: 'messageText'
      }, ({ value, error }) => {
        if (value) {
          this.setState({ message: value });
        } else if (error) {
          console.log(error);
        }
      });

      // sockClient.subscribe({
      //   bucket: 'leland.chat',
      //   key: 'message',
      //   query: /* GraphQL */`
      //     { message }
      //   `
      // }, ({ value }) => {
      //   console.log('query', value);
      // });

      sockClient.get({
        bucket: 'leland.chat',
        key: 'message',
        query: {
          document: /* GraphQL */`
            {
              itemCount: foo {
                length: list(length: true)
              }
              partialList: foo {
                list(slice: $slice)
              }
            }
          `,
          variables: {
            slice: [-1]
          }
        }
      }).catch(err => console.log(err))
        .then(value => {
          console.log('get', value);
        });

      // sockClient.subscribe({
      //   bucket: '_oplog',
      //   limit: 1,
      //   reverse: true,
      //   initialValue: false
      //   // values: false,
      // }, (data) => {
      //   console.log(data);
      // });
    }

    setMessage(value) {
      this.setState({ message: value });

      sockClient.patch({
        bucket: 'leland.chat',
        key: 'message',
        ops: [
          { op: 'replace', path: '/message', value },
          // { op: 'add', path: '/foo', value: {} },
          // { op: 'add', path: '/foo/list/3', value: 'blah' },
          // { op: 'move', from: '/foo/list/1', path: '/foo/list/0' }
          // { op: 'replace', path: '/foo/list', value: ['bar', 'none', 'ok'] },
        ]
      }).catch(err => console.error(err));

      sockClient.put({
        bucket: 'leland.chat',
        key: 'messageText',
        value
      }).catch(err => console.error(err));
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
      fetch(`${apiBaseRoute}/logout/${token}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        }
      }).catch(err => console.error(err))
        .then(res => console.log(res));
      sockClient.close();
      this.props.onLogout();
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
      token: session.get().accessToken,
      sessionInfo: session.get()
    }

    componentDidMount() {
      if (this.state.loggedIn) {
        const { expiresAt } = session.get();
        scheduleTokenRefresh({
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
      scheduleTokenRefresh({ expiresAt }, this.updateSessionInfo);
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
