import folium
import io
from typing import List, Dict, Any, Tuple
import logging
import time
import os
import pathlib
import requests
import zipfile
import tempfile
import geopandas as gpd
import shapely.geometry as sg
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import WebDriverException
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import re  # Added for hazard extraction
from datetime import datetime  # Added for time conversion
import pytz  # Added for time conversion


class MapService:
    """Service to generate maps with warning polygons"""

    def __init__(self, output_dir: str = "output"):
        self.logger = logging.getLogger(__name__)
        self.output_dir = output_dir
        self.shapefile_dir = os.path.join('data', 'shapefiles')
        self.county_shapefile_path = os.path.join(
            self.shapefile_dir, 'counties.geojson')
        self.map_templates_dir = os.path.join('weather_alerts', 'map_templates')
        # Using the updated logo file
        self.logo_path = os.path.join('assets', 'Transparent WKYW Logo.png')

        # Create output directory if it doesn't exist
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        # Create shapefile directory if it doesn't exist
        if not os.path.exists(self.shapefile_dir):
            os.makedirs(self.shapefile_dir)

        # Create assets directory if it doesn't exist
        assets_dir = os.path.dirname(self.logo_path)
        if not os.path.exists(assets_dir):
            os.makedirs(assets_dir)

        # Create map templates directory if it doesn't exist
        if not os.path.exists(self.map_templates_dir):
            os.makedirs(self.map_templates_dir)

    def download_county_shapefile(self) -> bool:
        """
        Download county shapefile from Census Bureau if not already present

        Returns:
            bool: True if successful, False otherwise
        """
        # Check if we already have the processed geojson file
        if os.path.exists(self.county_shapefile_path):
            self.logger.info(
                f"County shapefile already exists at {self.county_shapefile_path}")
            return True

        try:
            # URL to the Census Bureau county shapefile (using 2021 data, 500k resolution for a good balance)
            shapefile_url = "https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_county_500k.zip"

            self.logger.info(
                f"Downloading county shapefile from {shapefile_url}")

            # Create a temporary directory to store the downloaded zip file
            with tempfile.TemporaryDirectory() as temp_dir:
                zip_path = os.path.join(temp_dir, "counties.zip")

                # Download the shapefile
                response = requests.get(shapefile_url, stream=True)
                response.raise_for_status()

                # Save the zip file
                with open(zip_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)

                self.logger.info(f"Downloaded shapefile to {zip_path}")

                # Extract the zip file
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    zip_ref.extractall(temp_dir)

                self.logger.info(f"Extracted shapefile to {temp_dir}")

                # Find the .shp file
                shapefile_path = None
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        if file.endswith('.shp'):
                            shapefile_path = os.path.join(root, file)
                            break

                if not shapefile_path:
                    self.logger.error(
                        "No .shp file found in downloaded archive")
                    return False

                # Read the shapefile into a GeoDataFrame
                gdf = gpd.read_file(shapefile_path)

                # Simplify the geometries slightly to reduce file size
                gdf['geometry'] = gdf['geometry'].simplify(0.01)

                # Save as GeoJSON for easier use with Folium
                gdf.to_file(self.county_shapefile_path, driver='GeoJSON')

                self.logger.info(
                    f"Converted shapefile to GeoJSON: {self.county_shapefile_path}")

                return True

        except Exception as e:
            self.logger.error(
                f"Error downloading or processing county shapefile: {e}")
            return False

    def get_nearby_counties(self, polygon: List[List[float]], buffer_degrees: float = 0.5) -> gpd.GeoDataFrame:
        """
        Get counties that are nearby the warning polygon

        Args:
            polygon: Warning polygon coordinates in [lon, lat] format
            buffer_degrees: Buffer around the polygon in degrees

        Returns:
            GeoDataFrame of nearby counties
        """
        import shapely.geometry as sg

        # Ensure county shapefile is downloaded
        if not os.path.exists(self.county_shapefile_path):
            if not self.download_county_shapefile():
                self.logger.warning(
                    "Failed to download county shapefile, nearby counties will not be shown")
                return gpd.GeoDataFrame()

        try:
            # Load the county shapefile
            counties = gpd.read_file(self.county_shapefile_path)

            # Create a shapely polygon from the warning polygon coordinates
            # Warning polygons are in [lon, lat] format
            warning_poly = sg.Polygon([(p[0], p[1]) for p in polygon])

            # Create a buffer around the warning polygon
            buffered_poly = warning_poly.buffer(buffer_degrees)

            # Find counties that intersect with the buffered polygon
            nearby_counties = counties[counties.intersects(buffered_poly)]

            self.logger.info(
                f"Found {len(nearby_counties)} counties near the warning polygon")

            return nearby_counties

        except Exception as e:
            self.logger.error(f"Error getting nearby counties: {e}")
            return gpd.GeoDataFrame()

    def create_base_map(self, center_point: Tuple[float, float], 
                        zoom_level: int, 
                        tile_layer: str = 'OpenStreetMap') -> folium.Map:
        """Creates a Folium map instance with specified parameters."""
        # Create Folium map object
        m = folium.Map(
            location=center_point, 
            zoom_start=zoom_level, 
            tiles=tile_layer, 
            control_scale=True, # Keep scale control
            zoom_control=False,  # Disable zoom buttons
            control_layers=False # Disable layer control button
        )
        return m

    def create_context_map(self, polygon_coords_latlon: List[List[float]], 
                             center_point: Tuple[float, float], 
                             zoom_level: int, 
                             output_filename: str, 
                             polygon_color: str, 
                             tile_layer: str = 'CartoDB positron', 
                             tile_url: str = None, 
                             tile_attribution: str = None) -> None:
        """Creates a zoomed-out context map with the warning polygon."""
        self.logger.info(f"Creating context map: {output_filename} centered at {center_point} with zoom {zoom_level}")
        self.logger.info(f"Context map received polygon_coords_latlon: {polygon_coords_latlon}") # Log received coords

        context_m = folium.Map(
            location=center_point,
            zoom_start=zoom_level,
            tiles=tile_layer if tile_url is None else tile_url,
            attr=tile_attribution if tile_attribution is not None else None,
            control_scale=False, # No scale control for small map
            zoom_control=False,
            control_layers=False
        )

        if polygon_coords_latlon:
            self.logger.info(f"Adding polygon to context map with color: {polygon_color}") 
            folium.Polygon(
                locations=polygon_coords_latlon,
                color=polygon_color, # Use passed color
                weight=2,
                fill_color=polygon_color, # Use passed color
                fill_opacity=0.3
            ).add_to(context_m)
        else:
            self.logger.info("No polygon data provided to create_context_map, skipping polygon addition.") # Log if no polygon
        
        context_map_path = os.path.join(self.output_dir, output_filename)
        context_m.save(context_map_path)
        self.logger.info(f"Context map saved to: {context_map_path}")

    def create_warning_map(self, warning: Dict[str, Any]) -> str:
        """
        Create a map with the warning polygon

        Args:
            warning: Warning data including polygon coordinates

        Returns:
            Path to the generated HTML file
        """
        try:
            warning_id = warning.get('id', 'default')
            warning_polygon_coords_latlon = [] # Initialize here
            if 'polygon' not in warning or not warning['polygon']:
                self.logger.info("[create_warning_map] Condition: 'polygon' key missing or warning['polygon'] is empty/None.")
                self.logger.error(f"No polygon data found for warning: {warning_id}")
                return ""

            self.logger.info("[create_warning_map] Condition: Found 'polygon' in warning and it's not empty/None.")
            self.logger.info(f"[create_warning_map] Original warning['polygon'] being processed: {warning.get('polygon')}")
            # Convert to [[lat, lon]] for Folium
            warning_polygon_coords_latlon = [[coord[1], coord[0]] for coord in warning['polygon']]
            self.logger.info(f"[create_warning_map] Immediately after conversion, warning_polygon_coords_latlon: {warning_polygon_coords_latlon}")

            if not warning_polygon_coords_latlon:
                self.logger.info("[create_warning_map] Sub-condition: warning_polygon_coords_latlon IS empty after conversion attempt.")
                self.logger.error(f"Polygon data was present but resulted in empty coordinates for warning: {warning_id}")
                # Fallback if polygon processing fails unexpectedly
                map_center_lat, map_center_lon = self._get_map_center(warning) # Get general center
                zoom_level = self._calculate_zoom_level(None) # Default zoom
                # return "" # Optionally exit if critical polygon data is missing/invalid
            else:
                self.logger.info("[create_warning_map] Sub-condition: warning_polygon_coords_latlon IS NOT empty after conversion.")
                map_center_lat, map_center_lon = self._get_map_center(warning, warning_polygon_coords_latlon)
                zoom_level = self._calculate_zoom_level(warning_polygon_coords_latlon)

            # Determine map center: use polygon centroid with downward offset
            raw_polygon = warning['polygon']
            # Create shapely polygon and compute centroid
            warning_poly = sg.Polygon([(p[0], p[1]) for p in raw_polygon])
            centroid = warning_poly.centroid
            base_center_lat = centroid.y
            map_center_lon = centroid.x
            # Calculate latitude span and offset to move center down
            lats = [p[1] for p in raw_polygon if len(p) >= 2]
            if lats:
                lat_span = max(lats) - min(lats)
                offset = lat_span * 0.20  # 15% upward shift
                map_center_lat = base_center_lat + offset
                self.logger.info(
                    f"Offsetting map center up by {offset} degrees")
            else:
                map_center_lat = base_center_lat
            self.logger.info(
                f"Centering map on adjusted centroid: Lat={map_center_lat}, Lon={map_center_lon}")
            # Create a preliminary map object just for bounds calculation and initial setup
            # This map instance isn't the one directly rendered if create_base_map is called later,
            # but its settings should be consistent.
            m = folium.Map(
                location=[map_center_lat, map_center_lon],
                zoom_start=12,
                tiles=None,  # Start with no tiles, Stadia will be added manually
                zoom_control=False, # Ensure consistency
                control_layers=False # Ensure consistency
            )

            # Hardcoded Stadia API key for testing
            stadia_api_key = "179fb2bc-7c3f-493e-b6a4-00c23905eed5"
            
            # Main map: Alidade Bright (Beta)
            main_map_tiles_url = (
                f"https://tiles.stadiamaps.com/tiles/alidade_bright/{{z}}/{{x}}/{{y}}{{r}}.png"
                + (f"?api_key={stadia_api_key}" if stadia_api_key else "")
            )
            main_map_attribution = ('&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> '
                                  '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> '
                                  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors')
            folium.TileLayer(
                tiles=main_map_tiles_url,
                attr=main_map_attribution,
                name='Alidade Bright (Beta)',
                min_zoom=0,
                max_zoom=20,
                overlay=False,
                control=True
            ).add_to(m)

            # Get nearby counties to display on the map
            nearby_counties_gdf = self.get_nearby_counties(
                warning['polygon'])  # Renamed to avoid conflict

            # Add county boundaries to the map if available
            if not nearby_counties_gdf.empty:
                folium.GeoJson(
                    nearby_counties_gdf,  # Use renamed variable
                    name='County Boundaries',
                    style_function=lambda x: {
                        'fillColor': 'transparent',
                        'color': '#FFFFFF',
                        'weight': 1,
                        'opacity': 0.7
                    },
                    tooltip=folium.features.GeoJsonTooltip(
                        fields=['NAME'],
                        aliases=['County:'],
                        style=(
                            "background-color: white; color: #333333; font-family: arial; font-size: 12px; padding: 10px;")
                    )
                ).add_to(m)

            # Add polygon to map with color based on warning event type
            event_type = warning.get(
                'event', 'Unknown Warning')  # Default text
            warning_color = self._get_warning_color(event_type)

            folium.Polygon(
                locations=[[coord[1], coord[0]] for coord in warning['polygon']],
                color=warning_color,
                fill=True,
                fill_color=warning_color,
                fill_opacity=0.2,  # Set fill opacity to 0.2
                popup=folium.Popup(
                    f"<b>{event_type}</b><br>{warning.get('headline', '')}", max_width=300)
            ).add_to(m)

            # Add a layer control to allow toggling between map providers
            # folium.LayerControl().add_to(m) # Commented out to remove layer control

            # Extract information for the overlay
            affected_areas = self._extract_affected_areas(warning)
            hazards = self._extract_hazards_from_description(
                warning.get('description', ''))

            # Convert and format expiration time
            expires_str = warning.get('expires', 'Not available')
            formatted_expires_time = 'Not available'
            if expires_str and expires_str != 'Not available':
                try:
                    # Parse the ISO format string
                    # Example: 2024-07-21T19:00:00-05:00 or 2024-07-21T19:00:00Z
                    if expires_str.endswith('Z'):
                        dt_utc = datetime.strptime(
                            expires_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=pytz.utc)
                    else:
                        # Handle timezone offset like -05:00
                        if ':' in expires_str[-6:]:
                            dt_aware = datetime.fromisoformat(expires_str)
                        else:  # if no colon in offset, add it for fromisoformat
                            dt_aware = datetime.fromisoformat(
                                expires_str[:-2] + ':' + expires_str[-2:])
                        dt_utc = dt_aware.astimezone(pytz.utc)

                    # Convert to CDT
                    cdt_tz = pytz.timezone('America/Chicago')
                    dt_cdt = dt_utc.astimezone(cdt_tz)
                    formatted_expires_time = dt_cdt.strftime(
                        "%b %d, %Y, %I:%M %p")
                except ValueError as e:
                    self.logger.warning(
                        f"Could not parse expires time '{expires_str}': {e}")
                    # Fallback to original string if parsing fails

            # Format the main title
            main_title_text = f"A {event_type} has been issued"

            # Save the Folium map to a temporary file for iframe embedding
            temp_map_filename = f"_temp_map_for_iframe_{warning.get('id', 'default')}.html"
            map_save_path = os.path.join(self.output_dir, temp_map_filename)
            m.save(map_save_path)
            self.logger.info(f"Temporary Folium map saved to: {map_save_path}")

            # Create context map
            context_map_filename = f"_temp_context_map_{warning.get('id', 'default')}.html"
            self.logger.info(f"Calling create_context_map with Polygon: {warning_polygon_coords_latlon}, Center: ({map_center_lat}, {map_center_lon}), Zoom: 7, Color: {warning_color}")
            context_map_tiles_url = (
                f"https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{{z}}/{{x}}/{{y}}{{r}}.png"
                + (f"?api_key={stadia_api_key}" if stadia_api_key else "")
            )
            context_map_attribution = ('&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> '
                                     '&copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> '
                                     '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors')
            self.create_context_map(
                polygon_coords_latlon=warning_polygon_coords_latlon, 
                center_point=(map_center_lat, map_center_lon), 
                zoom_level=7,  # More zoomed out for context
                output_filename=context_map_filename,
                polygon_color=warning_color, # Pass the correct warning_color variable
                tile_url=context_map_tiles_url, # Pass full URL
                tile_attribution=context_map_attribution, # Pass attribution
            )
            context_map_iframe_src = context_map_filename # Assume success if no exception raised

            # Generate the full HTML structure embedding the map via iframe
            output_html_filename = f"{warning.get('id', 'default_warning').replace('.', '_')}.html"
            output_html_path = os.path.join(self.output_dir, output_html_filename)

            # Calculate relative path for CSS from the output HTML file's location
            css_file_path_absolute = os.path.abspath(os.path.join(self.map_templates_dir, 'alert_frame.css'))
            relative_css_path = os.path.relpath(css_file_path_absolute, start=os.path.abspath(self.output_dir))
            # Ensure POSIX-style paths for HTML href
            relative_css_path = pathlib.Path(relative_css_path).as_posix()

            html_content = self._generate_html_structure(
                warning_data=warning, 
                map_iframe_src=temp_map_filename,  # Pass the filename of the main map iframe
                context_map_iframe_src=context_map_filename, # Pass the filename of the context map iframe
                css_path=relative_css_path
            )
            with open(output_html_path, 'w', encoding='utf-8') as f:
                f.write(html_content)

            self.logger.info(f"Created warning map HTML: {output_html_path}")
            self.logger.info(f"DEBUG: create_warning_map is returning: {output_html_path}") # Added debug log
            return output_html_path

        except Exception as e:
            self.logger.error(f"Error creating warning map: {e}")
            return ""

    def html_to_image(self, html_path: str) -> str:
        """
        Convert an HTML file to a PNG image using Selenium

        Args:
            html_path: Path to the HTML file

        Returns:
            Path to the generated PNG file, or empty string if failed
        """
        try:
            abs_path = os.path.abspath(html_path)
            file_url = pathlib.Path(abs_path).as_uri()

            # Generate PNG filename from HTML path
            png_path = os.path.splitext(html_path)[0] + ".png"

            self.logger.info(
                f"Converting HTML to image: {html_path} → {png_path}")

            # Set up Chrome options with higher resolution for social media
            chrome_options = Options()
            chrome_options.add_argument("--headless")  # Run in headless mode
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument("--disable-gpu")
            # Add arguments to disable caching
            chrome_options.add_argument("--disable-application-cache")
            chrome_options.add_argument("--disk-cache-size=1")
            chrome_options.add_argument("--media-cache-size=1")
            chrome_options.add_argument("--v8-cache-options=off")

            # Match window size to map rendering area
            chrome_options.add_argument("--window-size=1080,1350") # New 4:5 aspect ratio

            # Initialize Chrome driver based on platform
            import platform
            system = platform.system()

            try:
                if system == 'Linux':
                    # On Debian/Linux systems, use chromium-browser directly
                    self.logger.info("Using Chromium for Debian/Linux")
                    driver = webdriver.Chrome(options=chrome_options)
                elif system == 'Darwin' and platform.machine() == 'arm64':
                    # On Mac ARM64, use the default Chrome driver directly
                    driver = webdriver.Chrome(options=chrome_options)
                else:
                    # On other platforms, try to use webdriver_manager
                    service = Service(ChromeDriverManager().install())
                    driver = webdriver.Chrome(
                        service=service, options=chrome_options)
            except Exception as e:
                self.logger.warning(
                    f"Failed to initialize primary Chrome driver: {e}")
                self.logger.info(
                    "Falling back to default Chrome/Chromium driver")
                # Fall back to default Chrome/Chromium driver path
                driver = webdriver.Chrome(options=chrome_options)

            try:
                # Navigate to the HTML file
                driver.get(file_url)

                # Give the page and iframe content time to load
                load_delay_seconds = 5
                self.logger.info(
                    f"Waiting for {load_delay_seconds} seconds for page and iframe to load...")
                time.sleep(load_delay_seconds)

                # Get the dimensions of the full page content
                total_width = driver.execute_script("return document.body.offsetWidth")

                # Take screenshot and save to file with high quality
                driver.save_screenshot(png_path)
                self.logger.info(
                    f"High-resolution screenshot saved to: {png_path}")

                return png_path

            finally:
                # Always close the driver
                driver.quit()

        except WebDriverException as e:
            self.logger.error(f"Selenium WebDriverException: {e}")
            return ""
        except Exception as e:
            self.logger.error(f"Error converting HTML to image: {e}")
            return ""

    def _calculate_polygon_center(self, polygon: List[List[float]]) -> Tuple[float, float]:
        """Calculate the center point of a polygon"""
        if not polygon:
            return 0, 0

        # For GeoJSON polygons, coordinates are [lon, lat]
        lats = [point[1] for point in polygon if len(point) >= 2]
        lons = [point[0] for point in polygon if len(point) >= 2]

        if not lats or not lons:
            return 0, 0

        center_lat = sum(lats) / len(lats)
        center_lon = sum(lons) / len(lons)

        return center_lat, center_lon

    def _get_warning_color(self, event_type: str) -> str:
        """
        Get appropriate color based on warning event type using the F5 Data color scheme
        https://www.f5data.com/colors/colors.htm
        """
        # Standard NWS warning colors based on F5 Data's color scheme
        warning_colors = {
            # Tornado Warnings
            "Tornado Warning": "#FF0000",  # Red
            "Tornado Emergency": "#FF00FF",  # Magenta

            # Severe Thunderstorm Warnings
            "Severe Thunderstorm Warning": "#FFFF00",  # Yellow

            # Flash Flood Warnings
            "Flash Flood Warning": "#00FF00",  # Green
            "Flash Flood Emergency": "#00FFFF",  # Cyan

            # Other Flood Warnings
            "Flood Warning": "#00A000",  # Dark Green
            "Areal Flood Warning": "#00A0A0",  # Dark Cyan
            "Flood Advisory": "#00A000",  # Dark Green

            # Winter Warnings
            "Winter Storm Warning": "#FF69B4",  # Hot Pink
            "Ice Storm Warning": "#FF69B4",  # Hot Pink
            "Blizzard Warning": "#FF69B4",  # Hot Pink
            "Lake Effect Snow Warning": "#FF69B4",  # Hot Pink

            # Winter Advisories
            "Winter Weather Advisory": "#FFC0CB",  # Pink
            "Freezing Rain Advisory": "#FFC0CB",  # Pink

            # Wind Warnings and Advisories
            "High Wind Warning": "#A52A2A",  # Brown
            "Wind Advisory": "#DEB887",  # Burlywood

            # Marine and Coastal Warnings
            "Hurricane Warning": "#FD6347",  # Tomato Red
            "Tropical Storm Warning": "#FD6347",  # Tomato Red
            "Storm Surge Warning": "#FD6347",  # Tomato Red
            "Coastal Flood Warning": "#6495ED",  # Cornflower Blue

            # Fire Weather Warnings
            "Red Flag Warning": "#FF4500",  # Orange Red
            "Fire Weather Warning": "#FF4500",  # Orange Red

            # Heat and Cold Warnings
            "Excessive Heat Warning": "#8B0000",  # Dark Red
            "Heat Advisory": "#CD5C5C",  # Indian Red
            "Wind Chill Warning": "#9400D3",  # Dark Violet
            "Extreme Cold Warning": "#9400D3",  # Dark Violet

            # Air Quality
            "Air Quality Alert": "#808080",  # Gray

            # Other Warnings
            "Dust Storm Warning": "#D2691E",  # Chocolate
            "Dense Fog Advisory": "#F0E68C",  # Khaki
        }

        # Return the color for the event type, or use severity-based fallback
        color = warning_colors.get(event_type)
        if color:
            return color

        # Fallback based on portions of the name
        for key_part in ["Tornado", "Severe", "Flash Flood", "Flood", "Winter", "Wind",
                         "Hurricane", "Tropical", "Heat", "Cold", "Fire"]:
            if key_part.lower() in event_type.lower():
                for warning_type, warning_color in warning_colors.items():
                    if key_part.lower() in warning_type.lower():
                        return warning_color

        # Default fallback based on severity terms in the event name
        if "warning" in event_type.lower():
            return "#FF0000"  # Red for warnings
        elif "watch" in event_type.lower():
            return "#FFA500"  # Orange for watches
        elif "advisory" in event_type.lower():
            return "#FFFF00"  # Yellow for advisories

        # Final default
        return "#808080"  # Gray for unknown

    def _get_map_center(self, warning: Dict[str, Any], polygon_coords_latlon: List[List[float]] = None) -> Tuple[float, float]:
        """
        Get the map center based on the warning data and polygon coordinates

        Args:
            warning: Warning data
            polygon_coords_latlon: Polygon coordinates in [lat, lon] format

        Returns:
            Tuple of (lat, lon) for the map center
        """
        # If polygon coordinates are provided, use them to calculate the center
        if polygon_coords_latlon:
            return self._calculate_polygon_center(polygon_coords_latlon)

        # Otherwise, use the warning's general location
        location = warning.get('location', '')
        if location:
            # Try to parse the location as a coordinate pair
            try:
                lat, lon = map(float, location.split(','))
                return lat, lon
            except ValueError:
                pass

        # Fallback to a default location
        return 37.0902, -95.7129  # Default to the center of the contiguous US

    def _calculate_zoom_level(self, polygon_coords_latlon: List[List[float]]) -> int:
        """
        Calculate the zoom level based on the polygon coordinates

        Args:
            polygon_coords_latlon: Polygon coordinates in [lat, lon] format

        Returns:
            Zoom level (integer)
        """
        if not polygon_coords_latlon:
            return 14  # Default zoom level

        # Calculate the bounding box of the polygon
        min_lat = min(point[0] for point in polygon_coords_latlon)
        max_lat = max(point[0] for point in polygon_coords_latlon)
        min_lon = min(point[1] for point in polygon_coords_latlon)
        max_lon = max(point[1] for point in polygon_coords_latlon)

        # Calculate the zoom level based on the bounding box size
        lat_span = max_lat - min_lat
        lon_span = max_lon - min_lon
        zoom_level = 14  # Default zoom level
        if lat_span > 10 or lon_span > 10:
            zoom_level = 6
        elif lat_span > 5 or lon_span > 5:
            zoom_level = 7
        elif lat_span > 2 or lon_span > 2:
            zoom_level = 8
        elif lat_span > 1 or lon_span > 1:
            zoom_level = 9
        elif lat_span > 0.5 or lon_span > 0.5:
            zoom_level = 10
        elif lat_span > 0.2 or lon_span > 0.2:
            zoom_level = 11

        return zoom_level

    def _format_expires_time(self, expires_str: str) -> str:
        """Formats the NWS expires time string into 'Month Day, Year, HH:MM AM/PM' format."""
        if not expires_str or expires_str == 'Not available':
            return 'Not available'
        try:
            # Example expires_str: "2024-05-24T18:00:00-05:00"
            dt_object = datetime.fromisoformat(expires_str)
            # Format to 'May 24, 2024, 06:00 PM'
            formatted_time = dt_object.strftime("%b %d, %Y, %I:%M %p")
            return formatted_time
        except ValueError as e:
            self.logger.error(f"Error parsing expires time '{expires_str}': {e}")
            return expires_str # Return original if parsing fails

    def _get_map_load_complete_script(self, map_js_name: str) -> str:
        return f'''
            <script>
                (function() {{ 
                    var mapInstance = window['{map_js_name}'];
                    var attempts = 0;
                    var maxAttempts = 50; // Try for 10 seconds (50 * 200ms)
                    var checkMapInterval = setInterval(function() {{
                        attempts++;
                        if (typeof mapInstance !== 'undefined' && mapInstance !== null) {{
                            if (mapInstance._loaded) {{
                                clearInterval(checkMapInterval);
                                if (!document.getElementById('map-load-complete')) {{
                                    var loadCompleteDiv = document.createElement('div');
                                    loadCompleteDiv.id = 'map-load-complete';
                                    loadCompleteDiv.style.display = 'none';
                                    document.body.appendChild(loadCompleteDiv);
                                    console.log("Map {map_js_name} initially loaded, map-load-complete div added.");
                                }}
                            }} else if (typeof mapInstance.on === 'function') {{
                                clearInterval(checkMapInterval);
                                mapInstance.on('load', function() {{
                                    if (!document.getElementById('map-load-complete')) {{
                                        var loadCompleteDiv = document.createElement('div');
                                        loadCompleteDiv.id = 'map-load-complete';
                                        loadCompleteDiv.style.display = 'none';
                                        document.body.appendChild(loadCompleteDiv);
                                        console.log("Map {map_js_name} 'load' event fired, map-load-complete div added.");
                                    }}
                                }});
                                if (mapInstance._loaded && !document.getElementById('map-load-complete')) {{ // Race condition check
                                    var loadCompleteDivFallback = document.createElement('div');
                                    loadCompleteDivFallback.id = 'map-load-complete';
                                    loadCompleteDivFallback.style.display = 'none';
                                    document.body.appendChild(loadCompleteDivFallback);
                                    console.log("Map {map_js_name} loaded (fallback), map-load-complete div added.");
                                }}
                            }}
                        }} else if (attempts >= maxAttempts) {{
                            clearInterval(checkMapInterval);
                            console.error("Map {map_js_name} not found or did not load after " + attempts + " attempts.");
                            // Optionally, add a fallback div to prevent Selenium from hanging indefinitely
                            if (!document.getElementById('map-load-complete')) {{
                                var errorDiv = document.createElement('div');
                                errorDiv.id = 'map-load-complete'; // Still use this ID so Selenium can proceed
                                errorDiv.setAttribute('data-error', 'Map load timeout');
                                errorDiv.style.display = 'none';
                                document.body.appendChild(errorDiv);
                                console.log("Added map-load-complete with error state after timeout.");
                            }}
                        }} else {{
                            mapInstance = window['{map_js_name}']; // Retry getting map instance
                        }}
                    }}, 200);
                }})();
            </script>
        '''

    def _extract_affected_areas(self, warning: Dict[str, Any]) -> str:
        """
        Extract affected areas (counties) from warning data

        Args:
            warning: Warning data

        Returns:
            String with affected areas
        """
        # Try to find affected areas in different parts of the warning
        affected_areas = ""

        # Check if there's a specific field for affected areas
        if 'areaDesc' in warning:
            return warning['areaDesc']

        # Try to extract from headline
        headline = warning.get('headline', '')
        if 'county' in headline.lower() or 'counties' in headline.lower():
            # Extract county information from headline
            counties_start = headline.lower().find('county')
            if counties_start > 0:
                # Look for the preceding text that likely contains county names
                possible_counties = headline[:counties_start].strip()
                return possible_counties

        # Try to extract from description
        description = warning.get('description', '')
        if description:
            # Look for patterns like "This includes the counties of..."
            includes_idx = description.lower().find('includes the count')
            if includes_idx > 0:
                # Extract the text after this phrase until the next period
                start_idx = includes_idx + 18  # Length of "includes the count"
                end_idx = description.find('.', start_idx)
                if end_idx > start_idx:
                    return description[start_idx:end_idx].strip()

        # If we can't find specific county information, return a generic message
        return "See warning details for specific locations"

    def _extract_hazards_from_description(self, description: str) -> str:
        """
        Extracts hazard information from the warning description.
        NWS descriptions often have a "HAZARD..." section.
        """
        if not description:
            return "Not specified"

        # Match everything after 'HAZARD...' up to 'IMPACT' or end
        hazard_match = re.search(
            r"HAZARD\.\.\.(.*?)(?:IMPACT|$)", description, re.IGNORECASE | re.DOTALL)
        if hazard_match:
            hazards = hazard_match.group(1).strip()
            # Clean up trailing punctuation
            hazards = hazards.rstrip('.').strip()
        # Append wind gust and hail details if present
        wind_match = re.search(
            r"wind gusts? (?:of|up to) (\d+)\s*mph", description, re.IGNORECASE)
        if wind_match:
            hazards += f"; Wind Gusts: {wind_match.group(1)} mph"
        # Limit length if necessary and convert to uppercase
        result = hazards[:250] + "..." if len(hazards) > 250 else hazards
        return result.upper()

        # Fallback: look for common keywords if specific section not found
        keywords = ["HAIL", "WIND", "TORNADO", "FLOOD", "HEAVY RAIN"]
        found = []
        for kw in keywords:
            if kw.lower() in description.lower():
                found.append(kw.title())
        # Return fallback in uppercase
        fallback = ", ".join(found) if found else "Not specified"
        return fallback.upper()

    def _get_image_base64(self, image_path: str) -> str:
        """
        Convert an image file to base64 encoding for embedding in HTML

        Args:
            image_path: Path to the image file

        Returns:
            Base64 encoded string representation of the image
        """
        import base64
        try:
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(
                    image_file.read()).decode('utf-8')
            return encoded_string
        except Exception as e:
            self.logger.error(f"Error encoding image {image_path}: {e}")
            return ""

    def _generate_html_structure(self, 
                                  warning_data: Dict[str, Any], 
                                  map_iframe_src: str, 
                                  context_map_iframe_src: str, 
                                  css_path: str) -> str:
        """Generates the complete HTML structure for the warning map page."""
        # 1. Page Title Bar (Orange in example)
        page_title_text = f"{warning_data.get('event', 'Unknown Warning').upper()}"
        title_bar_main_color = "#FFA500" # Orange for the main title
        
        styled_page_title_bar_html = f'''
        <div class="page-title-bar" style="background-color: {title_bar_main_color}; color: white; padding: 20px 30px; font-size: 32px; font-weight: bold; text-align: center; font-family: 'Roboto', 'Segoe UI', Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 1px;">
            {page_title_text}
        </div>
        '''

        # 2. Map Panel (Left side) - Now uses an iframe
        map_panel_html = f'''
        <div class="map-panel">
            <iframe src="{map_iframe_src}" style="width: 100%; height: 100%; border: none;"></iframe>
        </div>
        '''

        # 3. Sidebar Panel (Right side - for Warning Details)
        sidebar_bg_color = "#2E2E2E" # Dark gray for sidebar
        sidebar_text_color = "#FFFFFF"
        detail_heading_color = "#FFA500"

        sidebar_html = f'''
        <div class="sidebar-panel" style="background-color: {sidebar_bg_color}; color: {sidebar_text_color}; padding: 20px; font-family: 'Roboto', 'Segoe UI', Helvetica, Arial, sans-serif;">
            <h3 style="font-size: 20px; margin-top: 0; border-bottom: 1px solid #555; padding-bottom: 10px; font-weight: 700;">Warning Details</h3>
            
            <div class="detail-block">
                <h4 style="color: {detail_heading_color}; margin-bottom: 5px; text-transform: uppercase; font-weight: 700;">Valid Until</h4>
                <p style="margin-top: 0; margin-bottom: 15px;">{self._format_expires_time(warning_data.get('expires', 'Not available'))}</p>
            </div>
            
            <div class="detail-block">
                <h4 style="color: {detail_heading_color}; margin-bottom: 5px; text-transform: uppercase; font-weight: 700;">Affected Area</h4>
                <p style="margin-top: 0; margin-bottom: 15px;">{self._extract_affected_areas(warning_data)}</p>
            </div>

            <div class="detail-block">
                <h4 style="color: {detail_heading_color}; margin-bottom: 5px; text-transform: uppercase; font-weight: 700;">Threat Information</h4>
                <p style="margin-top: 0; margin-bottom: 15px;">{self._extract_hazards_from_description(warning_data.get('description', ''))}</p> 
            </div>

            <div class="detail-block">
                <h4 style="color: {detail_heading_color}; margin-bottom: 5px; text-transform: uppercase; font-weight: 700;">Hazard</h4>
                <p style="margin-top: 0; margin-bottom: 15px;">{self._extract_hazards_from_description(warning_data.get('description', ''))}</p>
            </div>
            
            <div class="detail-block">
                <h4 style="color: {detail_heading_color}; margin-bottom: 5px; text-transform: uppercase; font-weight: 700;">Warning Location</h4>
                <!-- Replace placeholder with iframe for context map -->
                <iframe src="{context_map_iframe_src}" style="width: 100%; height: 180px; border: 1px solid #444444; border-radius: 4px; margin-top: 5px;" title="Context Map"></iframe>
            </div>
        </div>
        '''

        # 4. Logo HTML (current logic is fine, placement will be via CSS or adjustments here later if needed)
        current_logo_html_str = ""
        if os.path.exists(self.logo_path):
            current_logo_html_str = f'''
                <div style="position: fixed; bottom: -60px; left: -40px; z-index: 9999; background-color: transparent; padding: 0;">
                    <img src="data:image/png;base64,{self._get_image_base64(self.logo_path)}" style="height: 360px; width: auto;" alt="Logo" />
                </div>
            '''
        else:
            self.logger.warning(f"Logo file not found at {self.logo_path}")

        # 5. Compose the final HTML document
        full_html = f"""
        <!DOCTYPE html>
        <html lang='en'>
        <head>
            <meta charset='utf-8'>
            <title>Weather Alert Map</title>
            <link rel='stylesheet' href='{css_path}' />
            <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
        </head>
        <body style='margin:0; background-color: #1C1C1C;'> 
            {styled_page_title_bar_html}
            <div class="main-content-area">
                {map_panel_html}
                {sidebar_html}
            </div>
            {current_logo_html_str}
        </body>
        </html>
        """
        return full_html
