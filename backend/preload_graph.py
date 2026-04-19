import os

from backend.core.road_network import load_graph_bbox, load_graph_from_file, save_graph

GRAPH_PATH = os.path.join(os.path.dirname(__file__), 'data', 'bengaluru.graphml')

BBOX = {
  'north': 12.9850,
  'south': 12.9200,
  'east': 77.6200,
  'west': 77.5500,
}

if __name__ == '__main__':
  if os.path.exists(GRAPH_PATH):
    graph = load_graph_from_file(GRAPH_PATH)
    print(f'[Preload] OK - {len(graph.nodes)} nodes, {len(graph.edges)} edges')
  else:
    graph = load_graph_bbox(**BBOX)
    save_graph(graph, GRAPH_PATH)
    print(f'[Preload] Saved to {GRAPH_PATH}')

