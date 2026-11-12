import { useScout } from '../store.jsx';
import { Icon } from './ui.jsx';

// Shown when the fair ranking uses a game model other than the club default.
export default function ModelNotice() {
  const { preset, setPreset, allowed } = useScout();
  if (preset === 'Balanced' || !allowed('find')) return null;
  return (
    <div className="model-notice" role="status">
      <Icon name="sliders" />
      <span>
        Fair ranks use your <b>{preset}</b> game model.
      </span>
      <a href="#find">Change</a>
      <button type="button" onClick={() => setPreset('Balanced')}>
        Back to Balanced
      </button>
    </div>
  );
}
