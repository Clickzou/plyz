import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export default function TestSVGScreen() {
  const testPath = "M 50 50 L 100 100 L 150 50";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Test SVG Rendering</Text>

      <View style={styles.testContainer}>
        <Text>White (#ffffff)</Text>
        <Svg width={200} height={100} viewBox="0 0 200 100" style={styles.svg}>
          <Path
            d={testPath}
            stroke="#ffffff"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>

      <View style={styles.testContainer}>
        <Text>Black (#000000)</Text>
        <Svg width={200} height={100} viewBox="0 0 200 100" style={styles.svg}>
          <Path
            d={testPath}
            stroke="#000000"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>

      <View style={styles.testContainer}>
        <Text>Red (#ff0000)</Text>
        <Svg width={200} height={100} viewBox="0 0 200 100" style={styles.svg}>
          <Path
            d={testPath}
            stroke="#ff0000"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>

      <View style={styles.testContainer}>
        <Text>Green (#00ff00)</Text>
        <Svg width={200} height={100} viewBox="0 0 200 100" style={styles.svg}>
          <Path
            d={testPath}
            stroke="#00ff00"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#1a1a1a',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  testContainer: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  svg: {
    backgroundColor: '#3a3a3a',
    marginTop: 10,
  },
});
