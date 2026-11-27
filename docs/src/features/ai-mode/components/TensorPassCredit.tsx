// cvfile.org's line under the question box of every assistant: the TensorPass mark and a link to TensorPass
// that names cvfile.org as its source.

import { BrandMark } from '@tensorpass/aiconnect-react';

const CREDIT_URL = 'https://tensorpass.app/?utm_source=cvfile&utm_medium=referral&utm_campaign=ai_credit';
const CREDIT_LABEL = 'AI features powered by TensorPass';

export function TensorPassCredit() {
  return (
    <a className="ai-credit" href={CREDIT_URL} target="_blank" rel="noopener">
      <BrandMark className="ai-credit__mark" />
      {CREDIT_LABEL}
    </a>
  );
}
