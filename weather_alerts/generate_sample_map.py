import logging
from map_service import MapService

def main():
    # Configure logging to print to console
    logging.basicConfig(level=logging.INFO)

    # Minimal sample warning polygon (square in [lon, lat])
    sample_warning = {
        "id": "test123",
        "event": "Severe Thunderstorm Warning",
        "headline": "Severe Thunderstorm Warning issued for Test County",
        "description": "HAZARD...60 MPH WIND GUSTS AND QUARTER SIZE HAIL. IMPACT...PEOPLE AND ANIMALS OUTDOORS WILL BE INJURED. EXPECT DAMAGE TO ROOFS, SIDING, WINDOWS, AND VEHICLES.",
        "areaDesc": "Test County, Test State",
        "polygon": [
            [-92.0, 37.0],
            [-92.0, 37.1],
            [-91.9, 37.1],
            [-91.9, 37.0],
            [-92.0, 37.0]  # Close the polygon
        ],
        "expires": "2025-05-24T18:00:00-05:00",
        "effective": "2025-05-24T16:30:00-05:00",
        "severity": "Severe",
        "certainty": "Likely",
        "urgency": "Immediate"
    }

    # Initialize MapService (output to default 'output' dir)
    map_service = MapService(output_dir="output")

    # Create the warning map HTML
    html_map_path = map_service.create_warning_map(sample_warning)

    if html_map_path:
        print(f"Generated HTML map at: {html_map_path}")
        # Convert HTML to PNG
        png_image_path = map_service.html_to_image(html_map_path)
        if png_image_path:
            print(f"Generated PNG image at: {png_image_path}") 
        else:
            print("Failed to generate PNG image.")
    else:
        print("Failed to generate HTML map.")

if __name__ == "__main__":
    main()
