from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path('login/', views.login_view, name='login'),
    path("signup/", views.signup, name="signup"),
    path("profile/", views.profile, name="profile"),
    path("roadmap/", views.roadmap, name="roadmap"),
    path("jobs/", views.job_list, name="jobs"),
]