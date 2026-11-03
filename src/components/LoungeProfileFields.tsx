import type { AppUserAgeGroup } from '../types';
import { loungeAgeGroups } from '../lib/lounge';

/** Region and introduction are no longer asked (2026-11-03); what a member wrote before is kept as it was. */
export type LoungeProfileFieldsValue = { ageGroup: AppUserAgeGroup | ''; region: string; bio: string };

/** The age group, for the rooms limited to an age range. With `required` one must be chosen. */
export function LoungeProfileFields({ value, onChange, disabled, required = false }: { value: LoungeProfileFieldsValue; onChange: (next: LoungeProfileFieldsValue) => void; disabled?: boolean; required?: boolean }) {
  return <div className="lounge-profile-fields">
    <fieldset className="form-field lounge-profile-age" disabled={disabled}>
      <legend>나이대{required && <em className="lounge-required"> 필수</em>}</legend>
      <div>{(required ? loungeAgeGroups : [{ id: '' as const, label: '밝히지 않음' }, ...loungeAgeGroups]).map(group => <label key={group.id}>
        <input type="radio" name="profile-age-group" value={group.id} checked={value.ageGroup === group.id} required={required} onChange={() => onChange({ ...value, ageGroup: group.id })} /><span>{group.label}</span></label>)}</div>
      <small className="lounge-account-field-note">연령대 제한이 있는 대화방에 들어갈 때 쓰여요.</small>
    </fieldset>
  </div>;
}
