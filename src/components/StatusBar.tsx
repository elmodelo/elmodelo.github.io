import { useStatusMessages } from '../hooks/useStatusMessages';
import StatusMessage from './StatusMessage';

export default function StatusBar() {
  const messages = useStatusMessages();
  return (
    <div className="status-bar" role="status" aria-live="polite" aria-atomic="true">
      {messages.map((message) => <StatusMessage key={message.id} {...message} />)}
    </div>
  );
}
