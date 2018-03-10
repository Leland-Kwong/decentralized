// TODO: add offline support #enhancement

import React, { Component } from 'react';
import { render } from 'react-dom';
import Socket from '../isomorphic/socket-client';
import * as auth from '../public/client/auth';
import session from '../public/client/session';
import Input from './Input';
import debounce from 'lodash.debounce';
import { HotKeys } from 'react-hotkeys';
import { serverApiBaseRoute, isDev } from '../public/client/config';
import DbViewer from './DbViewer';

const $App = document.querySelector('#App');
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

function startApp() {
  let sockClient;

  class Example extends Component {
    state = {
      message: '',
      items: {},
      notification: null,
      started: false
    }

    componentWillMount() {
      const uri = serverApiBaseRoute;
      const { token } = this.props;
      const storeName = 'client';
      console.log(token);
      this.socketDb = sockClient = new Socket({
        token,
        uri,
        storeName,
        dev: true,
      });

      sockClient.socket
        .on('connect', this.handleStart)
        .on('disconnect', this.handleDisconnect)
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
      return;
      if (this.state.started) {
        return;
      }
      this.setState({ started: true });

      sockClient
        .bucket('ticker')
        .key('count')
        .subscribe((data) => {
          this.setState({ ticker: data.value });
        });

      sockClient
        .bucket('leland.chat')
        .key('message')
        .filter({
          query: /* GraphQL */`
            { message }
          `
        })
        .subscribe((data) => {
          console.log('SUBSCRIBE', data.value.message);
        });

      const refreshList = () => {
        // refresh entire list
        const items = {};
        sockClient.bucket('leland.list')
          .filter({
            once: true,
            reverse: true,
            limit: 5,
          })
          .subscribe(
            (data) => {
              items[data.key] = data.value;
            },
            error => console.error(error),
            () => this.setState({ items })
          );
      };

      sockClient.bucket('leland.list')
        .filter({
          limit: 1,
          values: false,
          initialValue: false
        })
        .subscribe((data) => {
          if (data.event === 'patch') {
            const { items } = this.state;
            items[data.key] = data.value;
            this.setState({ items });
            return;
          }
          refreshList();
        });
      refreshList();
    }

    setMessage(value) {
      this.setState({ message: value });
      this.setMessageUpdateServer(value);
    }

    setMessageUpdateServer = debounce(function update(value) {
      const messageRef = sockClient
        .bucket('leland.chat')
        .key('message');
      messageRef
        .patch([
          { op: 'add', path: '/message', value },
          { op: 'add', path: '/nested', value: {} },
          { op: 'add', path: '/nested/value', value },
          { op: 'add', path: '/foo', value: { list: ['bar', 'none', 'ok'] } },
        ]).catch(err => {
          console.error(err);
          messageRef
            .put({})
            .catch(error => console.error(error))
            .then(() => {
              update(value);
            });
        });
    }, 10)

    handleLogout = () => {
      auth.logout()
        .then(res => console.log(res))
        .catch(err => console.error(err));
      sockClient.close();
      this.props.onLogout();
    }

    addItem = (e) => {
      e && e.preventDefault();
      const value = this.state.message;
      if (!value) {
        return;
      }
      const key = Date.now().toString();
      const doc = {
        text: value,
        done: false
      };
      const items = {
        ...this.state.items,
        [key]: doc
      };
      sockClient
        .bucket('leland.list')
        .key(key)
        .put(doc)
        .then(() => {
          this.setState({
            message: '',
            items
          });
        })
        .catch(err => console.error(err));
    }

    setDone = (key, done) => {
      const patch = [
        { op: 'replace', path: '/done', value: done }
      ];
      sockClient
        .bucket('leland.list')
        .key(key)
        .patch(patch);
      this.setState(({ items }) => {
        const itemCopy = { ...this.state.items[key] };
        itemCopy.done = done;
        return {
          items: { ...items, [key]: itemCopy }
        };
      });
    }

    removeItem = (key) => {
      const items = { ...this.state.items };
      delete items[key];
      sockClient
        .bucket('leland.list')
        .key(key)
        .del()
        .then(() => this.setState({ items }));
    }

    updateItemText = (key, value) => {
      const { items } = this.state;
      const item = items[key];
      item.text = value;
      this.setState({ items });
      this.updateItemTextServer(key, item);
    }

    updateItemTextServer = debounce((key, value) => {
      return sockClient.bucket('leland.list')
        .key(key)
        .put(value);
    }, 10)

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
          <DbViewer socketDb={this.socketDb} />
          <section>
            <strong>Ticker: {this.state.ticker}</strong>
          </section>
          <section>
            <form onSubmit={this.addItem}>
              <HotKeys keyMap={{
                requestSave: 'command+enter'
              }}
              >
                <label htmlFor="name" className="f6 b db mb2">Name <span className="normal black-60">(optional)</span></label>
                <Input
                  type='textarea'
                  placeholder="Enter a message..."
                  autoFocus
                  onChange={(e) => this.setMessage(e.target.value)}
                  value={this.state.message}
                  onRequestSave={() => this.addItem()}
                />
              </HotKeys>
            </form>
            {/* List - testing iteration of a bucket */}
            <ul>
              {Object.keys(this.state.items).sort().map((key) => {
                const item = this.state.items[key];
                return (
                  <li
                    key={key}
                    className='bt b--dark-gray pa2'
                  >
                    <div>
                      <Input
                        type='textarea'
                        onChange={e => this.updateItemText(key, e.target.value)}
                        value={item.text}
                      />
                      <div>
                        <label>
                          <input
                            type='checkbox'
                            onChange={() => this.setDone(key, !item.done)}
                            checked={item.done}
                          />
                          done
                        </label>
                      </div>
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
        if (isDev) return;

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
      }, () => {
        const { expiresAt } = session.get();
        auth.scheduleTokenRefresh({ expiresAt }, this.updateSessionInfo);
      });
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
