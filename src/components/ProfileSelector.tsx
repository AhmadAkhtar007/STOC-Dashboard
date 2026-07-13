import { PROFILES } from '../domain/profiles';
import type { ProfileId } from '../domain/types';

export function ProfileSelector({ value, disabled, onChange }: { value?: ProfileId; disabled: boolean; onChange: (id: ProfileId) => void }) {
  return <section className="panel profile-panel" aria-labelledby="profile-title">
    <div className="panel-heading"><span className="section-index">02</span><div><p className="eyebrow">Test recipe</p><h2 id="profile-title">Select profile</h2></div></div>
    <div className="profile-grid" role="radiogroup" aria-label="STOC test profiles">
      {Object.values(PROFILES).map(profile => <label key={profile.id} className={`profile-card ${value === profile.id ? 'selected' : ''}`}>
        <input type="radio" name="profile" value={profile.id} checked={value === profile.id} disabled={disabled} onChange={() => onChange(profile.id)} />
        <span className="profile-check" aria-hidden="true" /><strong>{profile.name}</strong>
        <span><b>{profile.targetAmps.toLocaleString()} A</b> design target</span><span>{profile.durationMs} ms intended duration</span>
      </label>)}
    </div>
  </section>;
}
