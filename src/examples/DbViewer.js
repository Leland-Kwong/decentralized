import React, { Component } from 'react';
import Input from './Input';
import { HotKeys } from 'react-hotkeys';
import JSONTree from 'react-json-tree';

export default class DbViewer extends Component {
  state = {
    bucket: '_opLog',
    data: {}
  }

  componentDidMount() {
    this.changeBucket();
  }

  setBucketName(value) {
    this.setState({ bucket: value });
  }

  changeBucket = () => {
    const { socketDb } = this.props;
    this.eventId
      && socketDb.unsubscribe(this.eventId);
    const $bucket = socketDb.bucket(this.state.bucket);
    this.eventId = $bucket
      .filter({
        limit: 1,
        values: false
      })
      .subscribe(() => {
        const newData = {};
        $bucket
          .filter({ limit: 1, once: true, reverse: true })
          .subscribe(
            data => {
              newData[data.key] = data.value;
            },
            () => {},
            () => this.setState({ data: newData })
          );
      });
  }

  render() {
    return (
      <div>
        <HotKeys keyMap={{
          requestSave: 'command+enter'
        }}
        >
          <Input
            onChange={ev => this.setBucketName(ev.target.value)}
            onRequestSave={this.changeBucket}
            value={this.state.bucket}
          />
        </HotKeys>
        <JSONTree data={this.state.data} />
      </div>
    );
  }
}
