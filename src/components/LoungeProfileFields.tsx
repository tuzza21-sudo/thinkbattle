import type { AppUserAgeGroup } from '../types';
import { loungeAgeGroups } from '../lib/lounge';
import { loungeBioLimit, loungeRegionLimit } from '../lib/loungeSocial';

export type LoungeProfileFieldsValue = { ageGroup: AppUserAgeGroup | ''; region: string; bio: string };

/** Age group, region and introduction: what other members see when they open this member's profile. With `required` all three must be filled in. */
export function LoungeProfileFields({ value, onChange, disabled, required = false }: { value: LoungeProfileFieldsValue; onChange: (next: LoungeProfileFieldsValue) => void; disabled?: boolean; required?: boolean }) {
  return <div className="lounge-profile-fields">
    <fieldset className="form-field lounge-profile-age" disabled={disabled}>
      <legend>나이대{required && <em className="lounge-required"> 필수</em>}</legend>
      <div>{(required ? loungeAgeGroups : [{ id: '' as const, label: '밝히지 않음' }, ...loungeAgeGroups]).map(group => <label key={group.id}>
        <input type="radio" name="profile-age-group" value={group.id} checked={value.ageGroup === group.id} required={required} onChange={() => onChange({ ...value, ageGroup: group.id })} /><span>{group.label}</span></label>)}</div>
      <small className="lounge-account-field-note">나이대를 고르면 연령대 제한이 있는 대화방에도 들어갈 수 있어요.</small>
    </fieldset>
    <label className="form-field"><span>지역{required && <em className="lounge-required"> 필수</em>}</span>
      <input value={value.region} onChange={event => onChange({ ...value, region: event.target.value })} maxLength={loungeRegionLimit} placeholder="예: 서울 마포구" autoComplete="off" disabled={disabled} required={required} /></label>
    <label className="form-field"><span>자기소개{required && <em className="lounge-required"> 필수</em>}</span>
      <textarea value={value.bio} onChange={event => onChange({ ...value, bio: event.target.value })} maxLength={loungeBioLimit} rows={3} placeholder="요즘 관심사나 나누고 싶은 이야기를 적어 보세요." disabled={disabled} required={required} />
      <small className="lounge-account-field-note">{value.bio.length}/{loungeBioLimit} · 같은 대화방에 있거나 친구인 분이 볼 수 있어요.</small></label>
  </div>;
}
