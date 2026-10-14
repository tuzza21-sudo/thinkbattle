import { Link } from 'react-router-dom';
import './LoungeBusinessFooter.css';

/** Business details shown at the bottom of the lounge's public pages, the same as on the debate service's page. */
export function LoungeBusinessFooter() {
  return <footer className="lounge-business-footer" aria-label="사업자 정보">
    <div className="lounge-business-info">
      <strong>사석</strong>
      <p><span>상호</span> 대치레드 <i aria-hidden="true" /> <span>대표</span> 최석빈</p>
      <p><span>사업자등록번호</span> 218-14-16906</p>
      <p><span>주소</span> 서울시 서초구 사임당로8길 13, 4층 402-331A호</p>
      <p><span>문의</span> <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a></p>
    </div>
    <div className="lounge-business-links">
      <Link to="/terms">이용약관</Link>
      <Link to="/privacy">개인정보 처리 안내</Link>
      <small>© 2026 사석</small>
    </div>
  </footer>;
}
