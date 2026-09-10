export function WolfEmblem({ large = false }: { large?: boolean }) {
  return <svg className={`wolf-emblem${large ? " large" : ""}`} viewBox="0 0 240 220" role="img" aria-label="달빛 아래 늑대 문양">
    <circle cx="120" cy="99" r="73" fill="#d9bd83" opacity=".15"/><circle cx="120" cy="99" r="63" fill="none" stroke="#d9bd83" strokeWidth=".6"/>
    <path d="M62 44 96 69 120 59 144 69 178 44 173 124 150 164 120 193 90 164 67 124Z" fill="#202c3c" stroke="#d9bd83" strokeWidth="1.5"/>
    <path d="m62 44 44 67-39 13m111-80-44 67 39 13M96 69l24 59 24-59m-38 42 14 17 14-17-14 63Z" fill="#334458" stroke="#728092" strokeWidth=".7"/>
    <path d="m81 110 29 12-17 5Zm78 0-29 12 17 5Z" fill="#efcc81"/>
    <path d="m110 157 10 8 10-8-10 24Z" fill="#0d1320"/>
    <path d="M23 171v31m-11-4 11-23 11 23M211 156v47m-17-6 17-35 17 35M37 30l3 5-3 5-3-5Zm158-7 3 5-3 5-3-5Z" fill="none" stroke="#a6916c" strokeWidth="1.2"/>
  </svg>;
}
export function NightLandscape() {
  return <svg className="wolf-landscape" viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="575" cy="86" r="55" fill="#dbc997" opacity=".9"/>
    <path d="M0 195 95 135 164 171 271 92 355 183 473 122 551 160 650 104 800 185V300H0Z" fill="#223043"/><path d="m0 238 162-47 108 43 175-69 140 61 117-61 98 48v87H0Z" fill="#172333"/>
    {[20,70,120,210,350,400,470,665,730,780].map((x,i)=><path key={x} d={`M${x} 300v-${90+i%3*22}m-23 65 23-57 23 57m-30-22 7-26 7 26`} fill="#0f1825" stroke="#0f1825" strokeWidth="5"/>)}
    <path d="m515 263 26-29 26 29v37h-52Zm57 8 19-22 19 22v29h-38Z" fill="#0c1320"/><path d="M537 267h8v13h-8Zm51 9h6v10h-6Z" fill="#dcb47a"/>
  </svg>;
}
