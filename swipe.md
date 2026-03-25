Step 1: Install All Dependencies

npm install react-native-tab-view react-native-pager-view react-native-pdf react-native-blob-util react-native-vector-icons

Then for iOS, install pods:
cd ios && pod install && cd ..

```

---

## Step 2: Project Structure

Organise your project like this:
```

src/
├── components/
│ ├── PDFViewer.jsx # Reusable PDF viewer component
│ └── CustomTabBar.jsx # Custom styled tab bar
├── screens/
│ ├── HomeScreen.jsx # Main screen with tabs
│ ├── RecentTab.jsx # Recent PDFs tab
│ ├── BookmarksTab.jsx # Bookmarked PDFs tab
│ └── AllFilesTab.jsx # All PDF files tab
└── App.jsx

Step 3: The Reusable PDF Viewer Component
src/components/PDFViewer.jsx

import React, { useState } from 'react';
import {
View,
Text,
StyleSheet,
ActivityIndicator,
TouchableOpacity,
Dimensions,
} from 'react-native';
import Pdf from 'react-native-pdf';

const { width, height } = Dimensions.get('window');

export default function PDFViewer({ filePath, fileName }) {
const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(0);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

const source = {
uri: filePath,
cache: true, // Cache PDFs locally for performance
};

return (
<View style={styles.container}>
{/_ Header _/}
<View style={styles.header}>
<Text style={styles.fileName} numberOfLines={1}>
{fileName || 'Document'}
</Text>
{!loading && (
<Text style={styles.pageCount}>
{currentPage} / {totalPages}
</Text>
)}
</View>

      {/* Loading Indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#075E54" />
          <Text style={styles.loadingText}>Loading PDF...</Text>
        </View>
      )}

      {/* Error State */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load PDF.</Text>
          <Text style={styles.errorSubText}>{error}</Text>
        </View>
      )}

      {/* PDF Renderer */}
      <Pdf
        source={source}
        style={styles.pdf}
        onLoadComplete={(numberOfPages) => {
          setTotalPages(numberOfPages);
          setLoading(false);
        }}
        onPageChanged={(page) => {
          setCurrentPage(page);
        }}
        onError={(err) => {
          setError(err.message);
          setLoading(false);
        }}
        enablePaging={true}         // Page-by-page swipe (horizontal)
        horizontal={false}          // Set true for horizontal page flipping
        fitPolicy={0}               // 0 = fit width, 1 = fit height, 2 = fit page
        enableAntialiasing={true}
        trustAllCerts={false}
      />
    </View>

);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: '#f5f5f5',
},
header: {
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
padding: 12,
backgroundColor: '#fff',
borderBottomWidth: 1,
borderBottomColor: '#e0e0e0',
},
fileName: {
fontSize: 14,
fontWeight: '600',
color: '#333',
flex: 1,
marginRight: 8,
},
pageCount: {
fontSize: 12,
color: '#888',
},
pdf: {
flex: 1,
width: width,
},
loadingContainer: {
position: 'absolute',
top: '50%',
left: 0,
right: 0,
alignItems: 'center',
zIndex: 10,
},
loadingText: {
marginTop: 8,
color: '#075E54',
fontSize: 14,
},
errorContainer: {
flex: 1,
alignItems: 'center',
justifyContent: 'center',
padding: 20,
},
errorText: {
fontSize: 16,
fontWeight: '600',
color: '#e53935',
},
errorSubText: {
fontSize: 12,
color: '#888',
marginTop: 6,
textAlign: 'center',
},
});

Step 4: Custom Tab Bar (WhatsApp Style)
src/components/CustomTabBar.jsx

import React from 'react';
import {
View,
Text,
TouchableOpacity,
StyleSheet,
Animated,
} from 'react-native';

export default function CustomTabBar({ navigationState, position, jumpTo }) {
const { routes, index } = navigationState;
const inputRange = routes.map((\_, i) => i);

return (
<View style={styles.tabBar}>
{routes.map((route, i) => {
// Animate label opacity — active tab is fully visible
const opacity = position.interpolate({
inputRange,
outputRange: inputRange.map((inputIndex) =>
inputIndex === i ? 1 : 0.6
),
});

        const isActive = index === i;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.tab}
            onPress={() => jumpTo(route.key)}
            activeOpacity={0.7}
          >
            <Animated.Text style={[styles.tabLabel, { opacity }]}>
              {route.title}
            </Animated.Text>

            {/* Active indicator bar */}
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>

);
}

const styles = StyleSheet.create({
tabBar: {
flexDirection: 'row',
backgroundColor: '#075E54', // WhatsApp dark green
elevation: 4,
shadowColor: '#000',
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.2,
shadowRadius: 2,
},
tab: {
flex: 1,
alignItems: 'center',
paddingVertical: 14,
},
tabLabel: {
color: '#fff',
fontSize: 13,
fontWeight: '600',
textTransform: 'uppercase',
letterSpacing: 0.5,
},
activeIndicator: {
position: 'absolute',
bottom: 0,
height: 3,
width: '80%',
backgroundColor: '#25D366', // WhatsApp light green
borderRadius: 2,
},
});

Step 5: Individual Tab Screens
src/screens/RecentTab.jsx

import React from 'react';
import {
View,
Text,
FlatList,
TouchableOpacity,
StyleSheet,
} from 'react-native';

// Sample data — replace with your actual file list
const RECENT_FILES = [
{ id: '1', name: 'Project Proposal.pdf', date: 'Today', size: '1.2 MB', uri: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf' },
{ id: '2', name: 'Invoice_March.pdf', date: 'Yesterday', size: '340 KB', uri: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf' },
{ id: '3', name: 'Meeting Notes.pdf', date: 'Mar 17', size: '520 KB', uri: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf' },
];

export default function RecentTab({ navigation }) {
const openPDF = (item) => {
// Navigate to a PDF detail screen (set this up in your navigator)
navigation?.navigate('PDFDetail', {
filePath: item.uri,
fileName: item.name,
});
};

const renderItem = ({ item }) => (
<TouchableOpacity style={styles.fileItem} onPress={() => openPDF(item)}>
<View style={styles.iconContainer}>
<Text style={styles.fileIcon}>📄</Text>
</View>
<View style={styles.fileInfo}>
<Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
<Text style={styles.fileMeta}>{item.date} · {item.size}</Text>
</View>
</TouchableOpacity>
);

return (
<View style={styles.container}>
<FlatList
data={RECENT_FILES}
keyExtractor={(item) => item.id}
renderItem={renderItem}
contentContainerStyle={styles.listContent}
showsVerticalScrollIndicator={false}
/>
</View>
);
}

const styles = StyleSheet.create({
container: { flex: 1, backgroundColor: '#fff' },
listContent: { padding: 16 },
fileItem: {
flexDirection: 'row',
alignItems: 'center',
paddingVertical: 12,
borderBottomWidth: 1,
borderBottomColor: '#f0f0f0',
},
iconContainer: {
width: 44,
height: 44,
borderRadius: 8,
backgroundColor: '#e8f5e9',
alignItems: 'center',
justifyContent: 'center',
marginRight: 12,
},
fileIcon: { fontSize: 22 },
fileInfo: { flex: 1 },
fileName: { fontSize: 15, fontWeight: '500', color: '#333' },
fileMeta: { fontSize: 12, color: '#999', marginTop: 3 },
});

src/screens/BookmarksTab.jsx

import React, { useState } from 'react';
import {
View,
Text,
FlatList,
TouchableOpacity,
StyleSheet,
} from 'react-native';

const BOOKMARKED_FILES = [
{ id: '1', name: 'Annual Report 2024.pdf', page: 12, size: '4.5 MB' },
{ id: '2', name: 'Contract_Draft.pdf', page: 3, size: '800 KB' },
];

export default function BookmarksTab() {
const [bookmarks, setBookmarks] = useState(BOOKMARKED_FILES);

const removeBookmark = (id) => {
setBookmarks((prev) => prev.filter((item) => item.id !== id));
};

const renderItem = ({ item }) => (
<View style={styles.fileItem}>
<View style={styles.iconContainer}>
<Text style={styles.fileIcon}>🔖</Text>
</View>
<View style={styles.fileInfo}>
<Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
<Text style={styles.fileMeta}>Bookmarked on page {item.page} · {item.size}</Text>
</View>
<TouchableOpacity onPress={() => removeBookmark(item.id)}>
<Text style={styles.removeBtn}>✕</Text>
</TouchableOpacity>
</View>
);

return (
<View style={styles.container}>
{bookmarks.length === 0 ? (
<View style={styles.emptyState}>
<Text style={styles.emptyIcon}>🔖</Text>
<Text style={styles.emptyText}>No bookmarks yet</Text>
<Text style={styles.emptySubText}>Bookmark pages while reading to find them here</Text>
</View>
) : (
<FlatList
data={bookmarks}
keyExtractor={(item) => item.id}
renderItem={renderItem}
contentContainerStyle={styles.listContent}
/>
)}
</View>
);
}

const styles = StyleSheet.create({
container: { flex: 1, backgroundColor: '#fff' },
listContent: { padding: 16 },
fileItem: {
flexDirection: 'row',
alignItems: 'center',
paddingVertical: 12,
borderBottomWidth: 1,
borderBottomColor: '#f0f0f0',
},
iconContainer: {
width: 44,
height: 44,
borderRadius: 8,
backgroundColor: '#fff8e1',
alignItems: 'center',
justifyContent: 'center',
marginRight: 12,
},
fileIcon: { fontSize: 22 },
fileInfo: { flex: 1 },
fileName: { fontSize: 15, fontWeight: '500', color: '#333' },
fileMeta: { fontSize: 12, color: '#999', marginTop: 3 },
removeBtn: { fontSize: 16, color: '#ccc', paddingHorizontal: 8 },
emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
emptyIcon: { fontSize: 48, marginBottom: 12 },
emptyText: { fontSize: 18, fontWeight: '600', color: '#555' },
emptySubText: { fontSize: 13, color: '#aaa', textAlign: 'center', marginTop: 6 },
});

src/screens/AllFilesTab.jsx

import React, { useState } from 'react';
import {
View,
Text,
FlatList,
TouchableOpacity,
TextInput,
StyleSheet,
} from 'react-native';

const ALL_FILES = [
{ id: '1', name: 'Project Proposal.pdf', size: '1.2 MB', date: 'Mar 19' },
{ id: '2', name: 'Invoice_March.pdf', size: '340 KB', date: 'Mar 18' },
{ id: '3', name: 'Meeting Notes.pdf', size: '520 KB', date: 'Mar 17' },
{ id: '4', name: 'Annual Report 2024.pdf', size: '4.5 MB', date: 'Mar 10' },
{ id: '5', name: 'Contract_Draft.pdf', size: '800 KB', date: 'Mar 5' },
];

export default function AllFilesTab() {
const [search, setSearch] = useState('');

const filtered = ALL_FILES.filter((f) =>
f.name.toLowerCase().includes(search.toLowerCase())
);

const renderItem = ({ item }) => (
<TouchableOpacity style={styles.fileItem}>
<View style={styles.iconContainer}>
<Text style={styles.fileIcon}>📂</Text>
</View>
<View style={styles.fileInfo}>
<Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
<Text style={styles.fileMeta}>{item.date} · {item.size}</Text>
</View>
</TouchableOpacity>
);

return (
<View style={styles.container}>
{/_ Search Bar _/}
<View style={styles.searchContainer}>
<TextInput
          style={styles.searchInput}
          placeholder="Search files..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
        />
</View>
<FlatList
data={filtered}
keyExtractor={(item) => item.id}
renderItem={renderItem}
contentContainerStyle={styles.listContent}
showsVerticalScrollIndicator={false}
/>
</View>
);
}

const styles = StyleSheet.create({
container: { flex: 1, backgroundColor: '#fff' },
searchContainer: {
padding: 12,
backgroundColor: '#f9f9f9',
borderBottomWidth: 1,
borderBottomColor: '#eee',
},
searchInput: {
backgroundColor: '#fff',
borderRadius: 8,
paddingHorizontal: 14,
paddingVertical: 9,
fontSize: 14,
borderWidth: 1,
borderColor: '#e0e0e0',
color: '#333',
},
listContent: { padding: 16 },
fileItem: {
flexDirection: 'row',
alignItems: 'center',
paddingVertical: 12,
borderBottomWidth: 1,
borderBottomColor: '#f0f0f0',
},
iconContainer: {
width: 44,
height: 44,
borderRadius: 8,
backgroundColor: '#e3f2fd',
alignItems: 'center',
justifyContent: 'center',
marginRight: 12,
},
fileIcon: { fontSize: 22 },
fileInfo: { flex: 1 },
fileName: { fontSize: 15, fontWeight: '500', color: '#333' },
fileMeta: { fontSize: 12, color: '#999', marginTop: 3 },
});

Step 6: The Main Home Screen (Ties Everything Together)
src/screens/HomeScreen.jsx

import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';

import CustomTabBar from '../components/CustomTabBar';
import RecentTab from './RecentTab';
import BookmarksTab from './BookmarksTab';
import AllFilesTab from './AllFilesTab';

export default function HomeScreen({ navigation }) {
const layout = useWindowDimensions();
const [index, setIndex] = useState(0);

const [routes] = useState([
{ key: 'recent', title: 'Recent' },
{ key: 'bookmarks', title: 'Bookmarks' },
{ key: 'all', title: 'All Files' },
]);

const renderScene = ({ route }) => {
switch (route.key) {
case 'recent':
return <RecentTab navigation={navigation} />;
case 'bookmarks':
return <BookmarksTab />;
case 'all':
return <AllFilesTab />;
default:
return null;
}
};

return (
<View style={styles.container}>
<TabView
navigationState={{ index, routes }}
renderScene={renderScene}
onIndexChange={setIndex}
initialLayout={{ width: layout.width }}

        // WhatsApp-like swipe behaviour
        swipeEnabled={true}
        animationEnabled={true}
        lazy={true}               // Only render a tab when visited
        lazyPreloadDistance={1}   // Preload 1 adjacent tab

        renderTabBar={(props) => (
          <CustomTabBar {...props} />
        )}
      />
    </View>

);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: '#fff',
},
});

Step 7: Wire Up Navigation in App.jsx
App.jsx

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import PDFViewer from './src/components/PDFViewer';

const Stack = createNativeStackNavigator();

export default function App() {
return (
<NavigationContainer>
<Stack.Navigator
screenOptions={{
          headerStyle: { backgroundColor: '#075E54' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }} >
<Stack.Screen
name="Home"
component={HomeScreen}
options={{ title: 'My PDF App' }}
/>
<Stack.Screen
name="PDFDetail"
component={({ route }) => (
<PDFViewer
              filePath={route.params.filePath}
              fileName={route.params.fileName}
            />
)}
options={({ route }) => ({ title: route.params.fileName })}
/>
</Stack.Navigator>
</NavigationContainer>
);
}

Also install navigation dependencies if you haven't:

npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context

```

---

## Final Result — How It All Works Together
```

App.jsx
└── NavigationContainer
└── Stack.Navigator
├── HomeScreen ← Swipeable tab view lives here
│ ├── Recent Tab ← Swipe ←→ to switch
│ ├── Bookmarks Tab
│ └── All Files Tab
└── PDFDetail Screen ← Opens when a PDF is tapped

                                                 Feature	How it's handled

Swipe to switch tabs react-native-tab-view with swipeEnabled={true}
WhatsApp-style tab bar CustomTabBar.jsx with green theme
PDF rendering react-native-pdf inside PDFViewer.jsx
Performance lazy={true} — tabs only render when visited
Search Built into AllFilesTab.jsx
Bookmarks State managed in BookmarksTab.jsx
