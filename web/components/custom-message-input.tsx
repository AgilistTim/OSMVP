"use client";

import { KeyboardEvent } from 'react';
import { Mic, MicOff, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CustomMessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  placeholder?: string;
  mode: 'text' | 'voice';
  onModeToggle: () => void;
}

export function CustomMessageInput({
  value,
  onChange,
  onSend,
  placeholder = "Type your message...",
  mode,
  onModeToggle,
}: CustomMessageInputProps) {
  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend(value);
      }
    }
  };

  const handleSendClick = () => {
    if (value.trim()) {
      onSend(value);
    }
  };

  return (
    <div className="custom-message-input">
      <textarea
        className="message-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyPress}
        placeholder={placeholder}
        rows={1}
      />
      <div className="input-actions">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mic-toggle-btn"
          onClick={onModeToggle}
          title={mode === 'text' ? 'Switch to voice' : 'Switch to text'}
        >
          {mode === 'text' ? (
            <Mic className="w-5 h-5" />
          ) : (
            <MicOff className="w-5 h-5" />
          )}
        </Button>
        <Button
          type="button"
          size="icon"
          className="send-btn"
          onClick={handleSendClick}
          disabled={!value.trim()}
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
