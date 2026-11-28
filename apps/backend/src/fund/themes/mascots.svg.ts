import type { FundReportProgressTier } from '@notstack/shared';

// ==========================================
// 🎨 ORIGINAL CHIBI VECTOR MASCOTS
// ตัวละคร Chibi ต้นฉบับสำหรับธีม Arcade Quest และ Cozy Journey
// หมายเหตุ: ห้ามใส่แท็ก <text> ใน SVG เพราะตัวโหลดภาพของ @napi-rs/canvas ใช้ฟอนต์ระบบต่างจาก GlobalFonts
// ==========================================

export function getArcadeQuestMascotSvg(tier: FundReportProgressTier): string {
    const eyeExpr =
        tier === 'complete'
            ? `
            <!-- Starlight joyful eyes -->
            <path d="M98 112 Q108 100 118 112" fill="none" stroke="#1E163D" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M162 112 Q172 100 182 112" fill="none" stroke="#1E163D" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M84 96 L88 103 L95 105 L88 107 L84 114 L80 107 L73 105 L80 103 Z" fill="#FBBF24"/>
            <path d="M196 94 L200 101 L207 103 L200 105 L196 112 L192 105 L185 103 L192 101 Z" fill="#22D3EE"/>
            <path d="M130 129 Q140 141 150 129 Z" fill="#F43F5E" stroke="#1E163D" stroke-width="2.5" stroke-linejoin="round"/>`
            : tier === 'medium'
              ? `
            <!-- Happy motivated anime eyes -->
            <ellipse cx="109" cy="112" rx="11" ry="13" fill="#17132E"/>
            <ellipse cx="171" cy="112" rx="11" ry="13" fill="#17132E"/>
            <circle cx="109" cy="115" r="7" fill="url(#eyeCyan)"/>
            <circle cx="171" cy="115" r="7" fill="url(#eyeViolet)"/>
            <circle cx="113" cy="107" r="4" fill="#FFFFFF"/>
            <circle cx="175" cy="107" r="4" fill="#FFFFFF"/>
            <circle cx="105" cy="119" r="2" fill="#FFFFFF" opacity="0.85"/>
            <circle cx="167" cy="119" r="2" fill="#FFFFFF" opacity="0.85"/>
            <path d="M97 96 Q109 92 120 97" fill="none" stroke="#4C1D95" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M160 97 Q171 92 183 96" fill="none" stroke="#4C1D95" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M132 130 Q140 139 148 130 Z" fill="#FB7185" stroke="#1E163D" stroke-width="2.2" stroke-linejoin="round"/>`
              : `
            <!-- Encouraging determined anime eyes -->
            <ellipse cx="109" cy="113" rx="11" ry="12.5" fill="#17132E"/>
            <ellipse cx="171" cy="113" rx="11" ry="12.5" fill="#17132E"/>
            <circle cx="109" cy="116" r="7" fill="url(#eyeCyan)"/>
            <circle cx="171" cy="116" r="7" fill="url(#eyeViolet)"/>
            <circle cx="113" cy="108" r="4" fill="#FFFFFF"/>
            <circle cx="175" cy="108" r="4" fill="#FFFFFF"/>
            <circle cx="105" cy="120" r="2" fill="#FFFFFF" opacity="0.85"/>
            <circle cx="167" cy="120" r="2" fill="#FFFFFF" opacity="0.85"/>
            <path d="M98 98 L120 101" fill="none" stroke="#4C1D95" stroke-width="2.6" stroke-linecap="round"/>
            <path d="M182 98 L160 101" fill="none" stroke="#4C1D95" stroke-width="2.6" stroke-linecap="round"/>
            <path d="M134 131 Q140 136 146 131" fill="none" stroke="#1E163D" stroke-width="2.6" stroke-linecap="round"/>`;

    const armsAndProps =
        tier === 'complete'
            ? `
            <!-- Victory raised arms -->
            <path d="M104 162 Q78 138 74 114" fill="none" stroke="#FFE4D6" stroke-width="11" stroke-linecap="round"/>
            <path d="M176 162 Q202 138 206 114" fill="none" stroke="#FFE4D6" stroke-width="11" stroke-linecap="round"/>
            <path d="M103 162 Q82 142 78 122" fill="none" stroke="#2D225A" stroke-width="13" stroke-linecap="round"/>
            <path d="M177 162 Q198 142 202 122" fill="none" stroke="#2D225A" stroke-width="13" stroke-linecap="round"/>
            <circle cx="74" cy="111" r="7" fill="#FFE4D6"/>
            <circle cx="206" cy="111" r="7" fill="#FFE4D6"/>
            <!-- Floating golden victory crown & burst stars -->
            <path d="M120 38 L127 20 L140 31 L153 20 L160 38 Z" fill="url(#goldGrad)" stroke="#FEF3C7" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="140" cy="27" r="3" fill="#22D3EE"/>
            <path d="M44 66 L48 76 L58 80 L48 84 L44 94 L40 84 L30 80 L40 76 Z" fill="#FBBF24"/>
            <path d="M236 62 L240 72 L250 76 L240 80 L236 90 L232 80 L222 76 L232 72 Z" fill="#22D3EE"/>
            <circle cx="56" cy="134" r="4" fill="#FBBF24"/>
            <circle cx="226" cy="144" r="4" fill="#A78BFA"/>`
            : tier === 'medium'
              ? `
            <!-- Left cheerful wave, right holding starlight wand -->
            <path d="M104 164 Q82 150 78 134" fill="none" stroke="#2D225A" stroke-width="13" stroke-linecap="round"/>
            <circle cx="76" cy="130" r="7" fill="#FFE4D6"/>
            <path d="M176 164 Q196 156 204 146" fill="none" stroke="#2D225A" stroke-width="13" stroke-linecap="round"/>
            <circle cx="206" cy="144" r="7" fill="#FFE4D6"/>
            <!-- Starlight scepter -->
            <line x1="206" y1="158" x2="218" y2="96" stroke="#8B5CF6" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M218 76 L223 89 L236 93 L223 98 L218 111 L213 98 L200 93 L213 89 Z" fill="url(#goldGrad)" stroke="#FEF08A" stroke-width="1.5"/>
            <circle cx="52" cy="96" r="3.5" fill="#22D3EE"/>
            <circle cx="242" cy="70" r="3" fill="#FBBF24"/>`
              : `
            <!-- Left cheering fist raised, right holding cyan quest crystal -->
            <path d="M104 164 Q82 146 82 126" fill="none" stroke="#2D225A" stroke-width="13" stroke-linecap="round"/>
            <circle cx="82" cy="122" r="7.5" fill="#FFE4D6"/>
            <path d="M176 164 Q196 168 202 154" fill="none" stroke="#2D225A" stroke-width="13" stroke-linecap="round"/>
            <circle cx="203" cy="151" r="7" fill="#FFE4D6"/>
            <!-- Floating cyan crystal orb -->
            <polygon points="214,126 226,140 214,154 202,140" fill="#22D3EE" stroke="#E0F2FE" stroke-width="2"/>
            <path d="M54 90 L57 98 L65 101 L57 104 L54 112 L51 104 L43 101 L51 98 Z" fill="#22D3EE" opacity="0.9"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">
  <defs>
    <radialGradient id="auraGlow" cx="50%" cy="48%" r="50%">
      <stop offset="0%" stop-color="#8B5CF6" stop-opacity="0.48"/>
      <stop offset="55%" stop-color="#22D3EE" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#17132E" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hairGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F5F3FF"/>
      <stop offset="55%" stop-color="#DDD6FE"/>
      <stop offset="100%" stop-color="#A78BFA"/>
    </linearGradient>
    <linearGradient id="capeGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3B2A7A"/>
      <stop offset="100%" stop-color="#1E1642"/>
    </linearGradient>
    <linearGradient id="eyeCyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22D3EE"/>
      <stop offset="100%" stop-color="#0284C7"/>
    </linearGradient>
    <linearGradient id="eyeViolet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#A78BFA"/>
      <stop offset="100%" stop-color="#6D28D9"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>

  <!-- Soft cosmic glow behind character -->
  <circle cx="140" cy="136" r="120" fill="url(#auraGlow)"/>

  <!-- Neon magic circle pedestal -->
  <ellipse cx="140" cy="242" rx="88" ry="20" fill="#1E1740" stroke="#8B5CF6" stroke-width="2.5"/>
  <ellipse cx="140" cy="240" rx="70" ry="14" fill="none" stroke="#22D3EE" stroke-width="2" stroke-dasharray="10 6"/>
  <ellipse cx="140" cy="239" rx="46" ry="8" fill="#22D3EE" opacity="0.22"/>

  <!-- Back hair & twin-tail flow -->
  <path d="M84 94 Q60 132 68 188 Q88 186 98 158 Z" fill="url(#hairGrad)" stroke="#4C1D95" stroke-width="2.5"/>
  <path d="M196 94 Q220 132 212 188 Q192 186 182 158 Z" fill="url(#hairGrad)" stroke="#4C1D95" stroke-width="2.5"/>
  <circle cx="140" cy="100" r="56" fill="url(#hairGrad)" stroke="#4C1D95" stroke-width="2.5"/>

  <!-- Adventurer cape -->
  <path d="M104 156 L84 216 Q140 228 196 216 L176 156 Z" fill="url(#capeGrad)" stroke="#22D3EE" stroke-width="2.2" stroke-linejoin="round"/>
  <!-- Boots & legs -->
  <rect x="118" y="204" width="14" height="24" rx="5" fill="#FFE4D6"/>
  <rect x="148" y="204" width="14" height="24" rx="5" fill="#FFE4D6"/>
  <rect x="114" y="218" width="22" height="17" rx="7" fill="#1E163D" stroke="#22D3EE" stroke-width="2"/>
  <rect x="144" y="218" width="22" height="17" rx="7" fill="#1E163D" stroke="#22D3EE" stroke-width="2"/>

  <!-- Tunic & pleated starry skirt -->
  <path d="M108 156 L172 156 L180 206 Q140 214 100 206 Z" fill="#2B1F58" stroke="#8B5CF6" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M104 198 Q140 208 176 198" fill="none" stroke="#22D3EE" stroke-width="2.5"/>
  <!-- Gold star clasp & cyan collar -->
  <path d="M122 152 L140 166 L158 152 Z" fill="#22D3EE"/>
  <path d="M140 156 L143 163 L150 165 L143 167 L140 174 L137 167 L130 165 L137 163 Z" fill="url(#goldGrad)"/>

  ${armsAndProps}

  <!-- Chibi face -->
  <ellipse cx="140" cy="108" rx="46" ry="42" fill="#FFE8DC" stroke="#4C1D95" stroke-width="2.5"/>
  <!-- Rosy blush -->
  <ellipse cx="106" cy="122" rx="8" ry="4.5" fill="#FDA4AF" opacity="0.65"/>
  <ellipse cx="174" cy="122" rx="8" ry="4.5" fill="#FDA4AF" opacity="0.65"/>

  ${eyeExpr}

  <!-- Front hair bangs -->
  <path d="M90 96 Q98 60 140 58 Q182 60 190 96 Q176 80 164 94 Q152 72 140 94 Q128 72 116 94 Q104 80 90 96 Z" fill="url(#hairGrad)" stroke="#4C1D95" stroke-width="2.3" stroke-linejoin="round"/>
  <!-- Cute ahoge heart-curl -->
  <path d="M140 58 Q134 38 148 36 Q156 38 146 50" fill="none" stroke="#8B5CF6" stroke-width="3.5" stroke-linecap="round"/>

  <!-- Winged guild hairpin -->
  <path d="M168 68 L184 56 L186 70 Z" fill="#F8FAFC" stroke="#22D3EE" stroke-width="1.8"/>
  <circle cx="170" cy="70" r="8" fill="url(#goldGrad)" stroke="#4C1D95" stroke-width="2"/>
  <circle cx="170" cy="70" r="3" fill="#22D3EE"/>
</svg>`;
}

export function getCozyJourneyMascotSvg(completed: boolean): string {
    const faceExpr = completed
        ? `
        <!-- Happy celebration eyes -->
        <path d="M98 108 Q107 98 116 108" fill="none" stroke="#55483E" stroke-width="4" stroke-linecap="round"/>
        <path d="M144 108 Q153 98 162 108" fill="none" stroke="#55483E" stroke-width="4" stroke-linecap="round"/>
        <path d="M123 123 Q130 132 137 123 Z" fill="#E07A5F" stroke="#55483E" stroke-width="2" stroke-linejoin="round"/>`
        : `
        <!-- Cozy sparkling eyes -->
        <circle cx="107" cy="108" r="8.5" fill="#55483E"/>
        <circle cx="153" cy="108" r="8.5" fill="#55483E"/>
        <circle cx="110" cy="104" r="3" fill="#FFFFFF"/>
        <circle cx="156" cy="104" r="3" fill="#FFFFFF"/>
        <circle cx="104" cy="111" r="1.6" fill="#FFFFFF" opacity="0.8"/>
        <circle cx="150" cy="111" r="1.6" fill="#FFFFFF" opacity="0.8"/>
        <path d="M124 123 Q130 128 136 123" fill="none" stroke="#55483E" stroke-width="2.4" stroke-linecap="round"/>`;

    const travelProp = completed
        ? `
        <!-- Waving arrival pennant flag & warm stars -->
        <path d="M168 156 Q188 134 192 114" fill="none" stroke="#F4B183" stroke-width="12" stroke-linecap="round"/>
        <circle cx="192" cy="112" r="7" fill="#FFE6D5" stroke="#55483E" stroke-width="2"/>
        <line x1="194" y1="158" x2="194" y2="74" stroke="#8C6D56" stroke-width="4" stroke-linecap="round"/>
        <polygon points="196,76 238,90 196,104" fill="#F4B183" stroke="#55483E" stroke-width="2" stroke-linejoin="round"/>
        <path d="M44 74 L48 82 L56 85 L48 88 L44 96 L40 88 L32 85 L40 82 Z" fill="#F4B183"/>
        <path d="M220 56 L223 63 L230 66 L223 69 L220 76 L217 69 L210 66 L217 63 Z" fill="#8BAF91"/>`
        : `
        <!-- Holding unfolded travel map -->
        <path d="M162 162 Q178 164 184 152" fill="none" stroke="#F4B183" stroke-width="11" stroke-linecap="round"/>
        <polygon points="164,136 184,130 202,138 220,131 220,168 202,174 184,167 164,172" fill="#FFFDF8" stroke="#55483E" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M172 156 Q186 142 198 154 T213 145" fill="none" stroke="#8BAF91" stroke-width="2.5" stroke-dasharray="4 3" stroke-linecap="round"/>
        <circle cx="212" cy="144" r="3.5" fill="#E07A5F"/>
        <circle cx="171" cy="156" r="3" fill="#A8D8EA"/>
        <circle cx="166" cy="154" r="6" fill="#FFE6D5" stroke="#55483E" stroke-width="1.8"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="250" viewBox="0 0 260 250">
  <defs>
    <radialGradient id="warmHalos" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#A8D8EA" stop-opacity="0.45"/>
      <stop offset="70%" stop-color="#FFF8EA" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#FFF8EA" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Pastel cloud & sky halo behind traveler -->
  <circle cx="130" cy="126" r="108" fill="url(#warmHalos)"/>
  <ellipse cx="130" cy="216" rx="76" ry="14" fill="#E8DFCE"/>

  <!-- Cute miniature luggage beside character -->
  <rect x="44" y="170" width="38" height="44" rx="7" fill="#D9A066" stroke="#55483E" stroke-width="2.2"/>
  <rect x="52" y="162" width="22" height="10" rx="4" fill="none" stroke="#55483E" stroke-width="2.2"/>
  <line x1="54" y1="170" x2="54" y2="214" stroke="#F4B183" stroke-width="4"/>
  <line x1="72" y1="170" x2="72" y2="214" stroke="#F4B183" stroke-width="4"/>
  <circle cx="63" cy="192" r="5" fill="#A8D8EA" stroke="#55483E" stroke-width="1.5"/>

  <!-- Tan explorer backpack peeking behind shoulders -->
  <rect x="86" y="144" width="88" height="48" rx="14" fill="#C49A6C" stroke="#55483E" stroke-width="2.2"/>
  <rect x="92" y="136" width="76" height="14" rx="7" fill="#A8D8EA" stroke="#55483E" stroke-width="2"/>

  <!-- Hair back -->
  <circle cx="130" cy="100" r="48" fill="#8C6249" stroke="#55483E" stroke-width="2.4"/>

  <!-- Boots & legs -->
  <rect x="110" y="190" width="13" height="19" rx="5" fill="#FFE6D5"/>
  <rect x="137" y="190" width="13" height="19" rx="5" fill="#FFE6D5"/>
  <rect x="106" y="203" width="20" height="14" rx="6" fill="#7D5A44" stroke="#55483E" stroke-width="2"/>
  <rect x="134" y="203" width="20" height="14" rx="6" fill="#7D5A44" stroke="#55483E" stroke-width="2"/>

  <!-- Cozy peach coat & sage scarf -->
  <path d="M98 148 L162 148 L168 194 Q130 202 92 194 Z" fill="#F4B183" stroke="#55483E" stroke-width="2.3" stroke-linejoin="round"/>
  <path d="M96 156 Q80 162 84 174" fill="none" stroke="#F4B183" stroke-width="11" stroke-linecap="round"/>
  <circle cx="85" cy="174" r="6" fill="#FFE6D5" stroke="#55483E" stroke-width="1.8"/>
  <rect x="104" y="140" width="52" height="14" rx="7" fill="#8BAF91" stroke="#55483E" stroke-width="2"/>
  <rect x="112" y="150" width="13" height="18" rx="5" fill="#8BAF91" stroke="#55483E" stroke-width="2"/>

  ${travelProp}

  <!-- Chibi face -->
  <ellipse cx="130" cy="104" rx="41" ry="38" fill="#FFE9DB" stroke="#55483E" stroke-width="2.4"/>
  <ellipse cx="100" cy="116" rx="7" ry="4" fill="#F4B183" opacity="0.75"/>
  <ellipse cx="160" cy="116" rx="7" ry="4" fill="#F4B183" opacity="0.75"/>

  ${faceExpr}

  <!-- Chestnut bangs -->
  <path d="M88 94 Q96 64 130 62 Q164 64 172 94 Q158 80 146 91 Q130 78 114 91 Q102 80 88 94 Z" fill="#8C6249" stroke="#55483E" stroke-width="2.2" stroke-linejoin="round"/>

  <!-- Cream explorer sun-hat with sage ribbon & sprout leaf -->
  <ellipse cx="130" cy="64" rx="54" ry="12" fill="#FFFDF7" stroke="#55483E" stroke-width="2.3"/>
  <path d="M94 62 Q98 30 130 30 Q162 30 166 62 Z" fill="#FFF8EA" stroke="#55483E" stroke-width="2.3"/>
  <path d="M95 57 Q130 63 165 57" fill="none" stroke="#8BAF91" stroke-width="6"/>
  <path d="M130 30 Q132 16 142 18 Q138 28 130 30 Z" fill="#8BAF91" stroke="#55483E" stroke-width="1.6"/>
</svg>`;
}
