import Svg, { Path, Circle, Rect, Ellipse } from 'react-native-svg';

const SILHOUETTE_COLOR = '#2E7D32';

export const FootballerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="20" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 35 L45 45 L40 60 L35 80 L35 95 L40 95 L42 70 L50 72 L58 70 L60 95 L65 95 L65 80 L60 60 L55 45 L50 35Z"
      fill={SILHOUETTE_COLOR}
    />
    <Circle cx="50" cy="90" r="8" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const CricketPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L48 45 L40 50 L35 75 L38 95 L43 95 L45 68 L50 70 L55 68 L57 95 L62 95 L65 75 L60 50 L52 45 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Rect x="65" y="25" width="25" height="5" fill={SILHOUETTE_COLOR} transform="rotate(45 65 25)" />
  </Svg>
);

export const BasketballPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L45 40 L30 50 L28 52 L40 58 L45 68 L42 95 L48 95 L50 70 L52 70 L54 95 L60 95 L57 68 L62 58 L72 52 L70 50 L55 40 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Circle cx="78" cy="25" r="10" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const HockeyPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L47 45 L42 55 L38 75 L35 95 L40 95 L43 68 L50 65 L57 68 L60 95 L65 95 L62 75 L58 55 L53 45 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Path d="M25 65 Q30 60 45 62" stroke={SILHOUETTE_COLOR} strokeWidth="4" fill="none" />
    <Rect x="20" y="63" width="8" height="15" rx="4" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const TennisPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L48 42 L40 52 L35 70 L38 95 L43 95 L45 65 L50 68 L55 65 L57 95 L62 95 L65 70 L60 52 L52 42 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Ellipse cx="72" cy="22" rx="15" ry="12" fill="none" stroke={SILHOUETTE_COLOR} strokeWidth="3" />
    <Rect x="58" y="18" width="20" height="4" fill={SILHOUETTE_COLOR} transform="rotate(35 58 18)" />
  </Svg>
);

export const VolleyballPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="20" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 34 L42 40 L32 38 L35 48 L40 65 L37 95 L43 95 L46 68 L50 70 L54 68 L57 95 L63 95 L60 65 L65 48 L68 38 L58 40 L50 34Z"
      fill={SILHOUETTE_COLOR}
    />
    <Circle cx="75" cy="15" r="9" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const TableTennisPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L48 44 L42 50 L38 70 L35 95 L41 95 L44 65 L50 68 L56 65 L59 95 L65 95 L62 70 L58 50 L52 44 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Ellipse cx="70" cy="35" rx="8" ry="6" fill={SILHOUETTE_COLOR} />
    <Rect x="55" y="33" width="18" height="3" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const BaseballPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L46 42 L38 48 L35 70 L38 95 L43 95 L45 68 L50 70 L55 68 L57 95 L62 95 L65 70 L62 48 L54 42 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Rect x="60" y="15" width="28" height="5" fill={SILHOUETTE_COLOR} transform="rotate(45 60 15)" />
  </Svg>
);

export const RugbyPlayerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="13" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 33 L42 42 L38 50 L32 65 L30 82 L33 95 L40 95 L43 70 L50 72 L57 70 L60 95 L67 95 L70 82 L68 65 L62 50 L58 42 L50 33Z"
      fill={SILHOUETTE_COLOR}
    />
    <Ellipse cx="75" cy="55" rx="8" ry="12" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const SingerSilhouette = ({ size = 60 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <Circle cx="50" cy="18" r="12" fill={SILHOUETTE_COLOR} />
    <Path
      d="M50 32 L45 42 L38 48 L32 52 L35 68 L38 95 L43 95 L45 65 L50 68 L55 65 L57 95 L62 95 L65 68 L68 52 L62 48 L55 42 L50 32Z"
      fill={SILHOUETTE_COLOR}
    />
    <Rect x="62" y="25" width="4" height="22" fill={SILHOUETTE_COLOR} />
    <Circle cx="64" cy="22" r="5" fill={SILHOUETTE_COLOR} />
    <Circle cx="64" cy="50" r="7" fill={SILHOUETTE_COLOR} />
  </Svg>
);

export const silhouettes = [
  { id: 'football', Component: FootballerSilhouette, label: 'Footballer' },
  { id: 'cricket', Component: CricketPlayerSilhouette, label: 'Cricket' },
  { id: 'basketball', Component: BasketballPlayerSilhouette, label: 'Basketball' },
  { id: 'hockey', Component: HockeyPlayerSilhouette, label: 'Hockey' },
  { id: 'tennis', Component: TennisPlayerSilhouette, label: 'Tennis' },
  { id: 'volleyball', Component: VolleyballPlayerSilhouette, label: 'Volleyball' },
  { id: 'tabletennis', Component: TableTennisPlayerSilhouette, label: 'Table Tennis' },
  { id: 'baseball', Component: BaseballPlayerSilhouette, label: 'Baseball' },
  { id: 'rugby', Component: RugbyPlayerSilhouette, label: 'Rugby' },
  { id: 'singer', Component: SingerSilhouette, label: 'Singer' },
];
