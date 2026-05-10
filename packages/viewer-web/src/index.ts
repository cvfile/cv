import { CvEmbed } from './cv-embed.js';

if (typeof window !== 'undefined' && !customElements.get('cv-embed')) {
  customElements.define('cv-embed', CvEmbed);
}

export { CvEmbed };
