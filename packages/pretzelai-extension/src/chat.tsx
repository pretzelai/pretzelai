import React, { useState } from 'react';
import { ReactWidget } from '@jupyterlab/apputils';
import { cutIcon } from '@jupyterlab/ui-components';
import { Box, IconButton, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

interface IMessage {
  id: string;
  body: string;
  type: 'agent' | 'human';
}

const mockMessages: IMessage[] = [
  { id: '1', body: 'Hello, how can I assist you today?', type: 'agent' },
  { id: '2', body: 'I have a question about machine learning.', type: 'human' }
];

export function Chat(): JSX.Element {
  const [messages, setMessages] = useState(mockMessages);
  const [input, setInput] = useState('');

  const onSend = () => {
    const newMessage = {
      id: String(messages.length + 1),
      body: input,
      type: 'human'
    };
    setMessages([...messages, newMessage as IMessage]);
    setInput('');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ flexGrow: 1, overflowY: 'auto', padding: 2 }}>
        {messages.map(message => (
          <Box key={message.id} sx={{ marginBottom: 2 }}>
            <Typography sx={{ fontWeight: 'bold' }} color={message.type === 'human' ? 'primary' : 'textSecondary'}>
              {message.type === 'human' ? 'You' : 'Agent'}
            </Typography>
            <Typography>{message.body}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', padding: 1 }}>
        <TextField value={input} onChange={e => setInput(e.target.value)} fullWidth placeholder="Type a message..." />
        <IconButton onClick={onSend}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

export function createChat(): ReactWidget {
  const widget = ReactWidget.create(<Chat />);
  widget.id = 'pretzelai::chat';
  widget.title.icon = cutIcon;
  widget.title.caption = 'Pretzel AI Chat'; // TODO: i18n
  return widget;
}
