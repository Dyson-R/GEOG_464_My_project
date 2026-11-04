# GEOG 464 Project
https://dyson-r.github.io/GEOG_464_My_project/site/
```
Right now, Urban planners in Montreal cannot easily find out where heat island eggect can best be combatted through tree planting. The person I am building this for is Urban planners. On my site, they will be able to identify temperature as well as tree data per borough. I am not going to try to come up with planting trategies or methods this term. "The two datasets I would start with are Îlots de chaleur 2025 and Inventaire arbres publics - Fichier consolidé (Arrondissements dans le système corporatif seulement).

# About the data

https://donnees.montreal.ca/fr/dataset/dbdfbdba-0725-470d-a23e-da69dbedc4e6/resource/9682167b-f2cd-48aa-9848-798037c368b0/download/icu_20250821.json Îlots de chaleur 2025, Données Quebec,  Attribution (CC-BY 4.0), accessed 13/10/2026. 

https://donnees.montreal.ca/dataset/arbres/resource/64e28fe6-ef37-437a-972d-d1d3f1f7d891 Inventaire arbres publics - Fichier consolidé (Arrondissements dans le système corporatif seulement),Ville de Montréal., Creative Commons Attribution 4.0 International, accessed 13/10/2026.

https://www.donneesquebec.ca/recherche/dataset/vmtl-limites-administratives-agglomeration Limites administratives de l'agglomération de Montréal (arrondissements et villes liées),Ville de Montréal, Attribution (CC-BY 4.0) Attribution (CC-BY 4.0), accesses 13/10/2026
#Ai Disclosure 

Lane: Bring your own agent 

I Used Claude Pro to individualy go through each block and understand the code. Claude help adapt the code from lab 4 to fit my data and project objectives. Additionally to the skeleton from lab 4 I had claude write blocks to modify my data as well as add features to my website such as grouping the heat zones and trees per borough and only loading the trees when the respective borough is clicked. 


#After the demo

What is the map about: Trees and heat island effect. How trees can affect temperature. 
What do the darkest colours mean: Higher temperature. 
Basemap: © OpenStreetMap contributors.

## A3 feature: Temperature Graph
For A3 I will add Graph, so that my reader can comapre heat data from different boroughs and click on teh different bars to zoom to the borough.
It has depth because it responds in both directions, you can click on the bar and it will zoom the the borough and if you click on the borough it can highlight the bar in the graph.
I will know it works when it displays heat data for all boroughs and clicking on a bar changes where we are zoomed in on the map.
My edge case is is the six boroughs with no public tree data (Outremont, Anjou, LaSalle, Montréal-Nord, Saint-Laurent and L’Île-Bizard–Sainte-Geneviève). Their bars must say “no tree data” instead of showing 0 trees per km², so a planner doesn’t read missing data as “this borough has no trees”. There should be no errors in the console.

Test 1. I will Click on Saint-Leonard on the graph. 
Expected: It will zoom to the borough allowing me to see heat zones and showing me the boroughs popup with tree and temperature data. 

Test 2. With the Saint-Leonard borough popup open, I will zoom out and click on annother borough. 
Expected: The heat zones will dissapear and the borough heat polygon will apear, when clickign on annother borough its popup will show and the borough will be highlighted in the graph. 
Test 3. With the console open, I zoom to street level over Saint-Laurent, where the city has no public tree data.
Expected: The heat zones show but there are no tree dots, and the status line explains that there is no public tree data for this area. No red errors in the console.

© 2026 Luke Russell. All rights reserved.
